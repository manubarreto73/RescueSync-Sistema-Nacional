import { Injectable } from '@nestjs/common';
import { BusinessException, ConflictoException } from '../../../common/exceptions';
import { PrismaService } from '../../../prisma/prisma.service';
import { OrganizacionesService } from '../../organizaciones/services/organizaciones.service';
import {
  ActualizarRecursosDto,
  InventarioResponseDto,
  RecursoResponseDto,
} from '../dtos/recursos.dto';
import { RecursoRepository } from '../repositories/recurso.repository';

@Injectable()
export class RecursosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recursoRepository: RecursoRepository,
    private readonly organizacionesService: OrganizacionesService,
  ) {}

  async getInventario(codigo: string): Promise<InventarioResponseDto> {
    const organizacion = await this.organizacionesService.findByCodigo(codigo);
    const recursos = await this.recursoRepository.findByOrganizacion(organizacion.id);

    return { codigoNacional: codigo, recursos: recursos.map(RecursoResponseDto.from) };
  }

  /**
   * Actualiza el inventario con las filas bloqueadas.
   *
   * Sin el lock, un compromiso podria colarse entre la verificacion y la
   * escritura: la ONG baja su total a 5 mientras una adjudicacion compromete
   * 8 de los 10 que habia, y el recurso queda sobre-asignado.
   */
  async actualizar(codigo: string, dto: ActualizarRecursosDto): Promise<InventarioResponseDto> {
    const categorias = dto.recursos.map((r) => r.categoria);
    if (new Set(categorias).size !== categorias.length) {
      throw new BusinessException('Cada categoria puede aparecer una sola vez');
    }

    const organizacion = await this.organizacionesService.findByCodigo(codigo);

    await this.prisma.$transaction(async (tx) => {
      const existentes = await this.recursoRepository.bloquearDeOrganizacion(organizacion.id, tx);

      const conflictos = dto.recursos.flatMap((item) => {
        const actual = existentes.find((r) => r.categoria === item.categoria);
        return actual && item.cantidadTotal < actual.cantidadComprometida
          ? [
              {
                categoria: item.categoria,
                cantidadTotal: item.cantidadTotal,
                cantidadComprometida: actual.cantidadComprometida,
              },
            ]
          : [];
      });

      if (conflictos.length > 0) {
        throw new ConflictoException(
          'No se puede reducir el inventario por debajo de lo comprometido',
          { conflictos },
        );
      }

      for (const item of dto.recursos) {
        await this.recursoRepository.upsert(organizacion.id, item, tx);
      }
    });

    return this.getInventario(codigo);
  }
}
