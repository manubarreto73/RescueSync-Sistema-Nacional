import { Injectable } from '@nestjs/common';
import { EstadoCompromiso, EstadoOrganizacion, EstadoProyecto, Organizacion } from '@prisma/client';
import {
  BusinessException,
  ConflictoException,
  ResourceNotFoundException,
} from '../../../common/exceptions';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaTransaction } from '../../../prisma/transaction.types';
import { OrganizacionRepository } from '../../organizaciones/repositories/organizacion.repository';
import { RecursoRepository } from '../../recursos/repositories/recurso.repository';
import {
  CierreResponseDto,
  ComprometerRecursosDto,
  FaltanteDto,
  ProyectoResponseDto,
} from '../dtos/compromisos.dto';
import { ProyectoRepository } from '../repositories/proyecto.repository';

/**
 * Margen de las transacciones con locks. maxWait es cuanto se espera por una
 * conexion libre del pool; timeout, cuanto puede durar la transaccion
 * incluida la espera por los locks que tengan otras.
 */
const OPCIONES_TX = { maxWait: 10_000, timeout: 20_000 };

const LARGO_MAXIMO_REFERENCIA = 50;

@Injectable()
export class ProyectosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly proyectoRepository: ProyectoRepository,
    private readonly organizacionRepository: OrganizacionRepository,
    private readonly recursoRepository: RecursoRepository,
  ) {}

  /**
   * Compromete los recursos de las ONGs adjudicadas (eslabon 6).
   *
   * Todo ocurre en una transaccion con bloqueo pesimista:
   *   1. Se bloquea el proyecto (creandolo si es su primer compromiso).
   *   2. Se bloquean las filas de recursos involucradas, ordenadas por id.
   *   3. Con las filas bloqueadas se verifica el disponible de cada item.
   *   4. Si a alguno no le alcanza, se aborta todo: no se compromete nada.
   *   5. Si alcanza, se suma a lo comprometido y se registran los compromisos.
   *
   * Idempotente ante reintentos: si todas las ONGs del request ya tienen su
   * compromiso en el proyecto (Bonita reintento tras un timeout), devuelve el
   * estado actual sin volver a comprometer.
   */
  async comprometer(referencia: string, dto: ComprometerRecursosDto): Promise<ProyectoResponseDto> {
    this.validarReferencia(referencia);
    this.validarSinDuplicados(dto);

    const codigos = dto.compromisos.map((c) => c.codigoNacional);

    return this.prisma.$transaction(async (tx) => {
      await this.proyectoRepository.crearSiNoExiste(referencia, dto.gravedad, tx);
      const proyecto = await this.proyectoRepository.bloquear(referencia, tx);

      if (!proyecto) {
        throw new ResourceNotFoundException(`No existe el proyecto ${referencia}`);
      }

      if (proyecto.estado === EstadoProyecto.FINALIZADO) {
        throw new ConflictoException(`El proyecto ${referencia} ya fue finalizado`);
      }

      const organizaciones = await this.resolverOrganizaciones(codigos, tx);
      const porCodigo = new Map(organizaciones.map((o) => [o.codigoNacional, o]));

      const yaComprometidas = await this.proyectoRepository.findCompromisos(
        proyecto.id,
        { organizacionIds: organizaciones.map((o) => o.id) },
        tx,
      );

      if (yaComprometidas.length === organizaciones.length) {
        return this.detalle(referencia, tx);
      }

      if (yaComprometidas.length > 0) {
        throw new ConflictoException(
          `Algunas organizaciones ya tienen un compromiso en el proyecto ${referencia}`,
          { organizaciones: yaComprometidas.map((c) => c.organizacion.codigoNacional) },
        );
      }

      // Recurso de cada (organizacion, categoria) pedida. Puede no existir:
      // una ONG que nunca cargo esa categoria tiene disponible 0.
      const recursos = await this.recursoRepository.findManyByOrganizaciones(
        organizaciones.map((o) => o.id),
        tx,
      );
      const recursoDe = (organizacionId: number, categoria: string) =>
        recursos.find((r) => r.organizacionId === organizacionId && r.categoria === categoria);

      const pedidos = dto.compromisos.flatMap((compromiso) => {
        const organizacion = porCodigo.get(compromiso.codigoNacional)!;
        return compromiso.items.map((item) => ({
          organizacion,
          categoria: item.categoria,
          cantidad: item.cantidad,
          recurso: recursoDe(organizacion.id, item.categoria),
        }));
      });

      // El lock. A partir de aca, ninguna otra transaccion puede tocar estas
      // filas hasta el COMMIT o ROLLBACK de esta.
      const bloqueados = await this.recursoRepository.bloquear(
        pedidos.flatMap((p) => (p.recurso ? [p.recurso.id] : [])),
        tx,
      );
      const bloqueadoPorId = new Map(bloqueados.map((r) => [r.id, r]));

      // Se lee el disponible de las filas bloqueadas, no de la consulta
      // anterior: esa pudo quedar vieja mientras se esperaba el lock.
      const faltantes: FaltanteDto[] = pedidos.flatMap((p) => {
        const fila = p.recurso ? bloqueadoPorId.get(p.recurso.id) : undefined;
        const disponible = fila ? fila.cantidadTotal - fila.cantidadComprometida : 0;

        return p.cantidad > disponible
          ? [
              {
                codigoNacional: p.organizacion.codigoNacional,
                categoria: p.categoria,
                pedido: p.cantidad,
                disponible,
              },
            ]
          : [];
      });

      if (faltantes.length > 0) {
        throw new ConflictoException(
          `Recursos insuficientes para comprometer el proyecto ${referencia}`,
          { faltantes },
        );
      }

      for (const pedido of pedidos) {
        await this.recursoRepository.ajustarComprometida(pedido.recurso!.id, pedido.cantidad, tx);
      }

      for (const compromiso of dto.compromisos) {
        const organizacion = porCodigo.get(compromiso.codigoNacional)!;
        await this.proyectoRepository.crearCompromiso(
          proyecto.id,
          organizacion.id,
          compromiso.items.map((item) => ({
            recursoId: recursoDe(organizacion.id, item.categoria)!.id,
            cantidad: item.cantidad,
          })),
          tx,
        );
      }

      return this.detalle(referencia, tx);
    }, OPCIONES_TX);
  }

  /**
   * Cierre del proyecto (eslabon 7): libera todos los compromisos activos y
   * devuelve el stock a cada ONG.
   *
   * Idempotente: cerrar un proyecto ya finalizado devuelve 200 con
   * `liberados` vacio, asi un reintento del conector no produce errores.
   */
  async cerrar(referencia: string): Promise<CierreResponseDto> {
    this.validarReferencia(referencia);

    return this.prisma.$transaction(async (tx) => {
      const proyecto = await this.proyectoRepository.bloquear(referencia, tx);

      if (!proyecto) {
        throw new ResourceNotFoundException(`No existe el proyecto ${referencia}`);
      }

      if (proyecto.estado === EstadoProyecto.FINALIZADO) {
        const actual = await tx.proyecto.findUniqueOrThrow({ where: { id: proyecto.id } });
        return {
          referencia,
          estado: EstadoProyecto.FINALIZADO,
          fechaCierre: actual.fechaCierre!,
          liberados: [],
        };
      }

      const activos = await this.proyectoRepository.findCompromisos(
        proyecto.id,
        { estado: EstadoCompromiso.ACTIVO },
        tx,
      );

      // Cuanto devolver a cada fila de recursos.
      const aDevolver = new Map<number, number>();
      for (const item of activos.flatMap((c) => c.items)) {
        aDevolver.set(item.recursoId, (aDevolver.get(item.recursoId) ?? 0) + item.cantidad);
      }

      // Mismo lock que el compromiso: un cierre y un compromiso de otro
      // proyecto sobre el mismo recurso no pueden pisarse.
      await this.recursoRepository.bloquear([...aDevolver.keys()], tx);

      for (const [recursoId, cantidad] of aDevolver) {
        await this.recursoRepository.ajustarComprometida(recursoId, -cantidad, tx);
      }

      const ahora = new Date();
      await this.proyectoRepository.liberarCompromisos(proyecto.id, ahora, tx);
      await this.proyectoRepository.finalizar(proyecto.id, ahora, tx);

      return {
        referencia,
        estado: EstadoProyecto.FINALIZADO,
        fechaCierre: ahora,
        liberados: activos.map((c) => ({
          codigoNacional: c.organizacion.codigoNacional,
          items: c.items.map((i) => ({ categoria: i.recurso.categoria, cantidad: i.cantidad })),
        })),
      };
    }, OPCIONES_TX);
  }

  // ------------------------------------------------------------------

  private async detalle(referencia: string, tx: PrismaTransaction): Promise<ProyectoResponseDto> {
    const proyecto = await this.proyectoRepository.findDetalle(referencia, tx);
    return ProyectoResponseDto.from(proyecto!);
  }

  /** Todas deben existir y estar habilitadas: no se comprometen recursos de una suspendida. */
  private async resolverOrganizaciones(
    codigos: string[],
    tx: PrismaTransaction,
  ): Promise<Organizacion[]> {
    const organizaciones = await this.organizacionRepository.findManyByCodigos(codigos, tx);

    const inexistentes = codigos.filter((c) => !organizaciones.some((o) => o.codigoNacional === c));
    if (inexistentes.length > 0) {
      throw new ResourceNotFoundException(
        `No existen las organizaciones: ${inexistentes.join(', ')}`,
      );
    }

    const noHabilitadas = organizaciones.filter((o) => o.estado !== EstadoOrganizacion.HABILITADA);
    if (noHabilitadas.length > 0) {
      throw new ConflictoException('Hay organizaciones no habilitadas para comprometer recursos', {
        organizaciones: noHabilitadas.map((o) => ({
          codigoNacional: o.codigoNacional,
          estado: o.estado,
        })),
      });
    }

    return organizaciones;
  }

  private validarSinDuplicados(dto: ComprometerRecursosDto): void {
    const codigos = dto.compromisos.map((c) => c.codigoNacional);
    if (new Set(codigos).size !== codigos.length) {
      throw new BusinessException('Cada organizacion puede aparecer una sola vez');
    }

    for (const compromiso of dto.compromisos) {
      const categorias = compromiso.items.map((i) => i.categoria);
      if (new Set(categorias).size !== categorias.length) {
        throw new BusinessException(
          `${compromiso.codigoNacional}: cada categoria puede aparecer una sola vez`,
        );
      }
    }
  }

  private validarReferencia(referencia: string): void {
    if (referencia.length > LARGO_MAXIMO_REFERENCIA) {
      throw new BusinessException(
        `La referencia del proyecto admite hasta ${LARGO_MAXIMO_REFERENCIA} caracteres`,
      );
    }
  }
}
