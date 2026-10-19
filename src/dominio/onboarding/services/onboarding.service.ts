import { Injectable } from '@nestjs/common';
import { EstadoOrganizacion, RolCuenta, TipoOrganizacion } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ConflictoException } from '../../../common/exceptions';
import { PrismaService } from '../../../prisma/prisma.service';
import { PasswordService } from '../../../security/password.service';
import { OrganizacionRepository } from '../../organizaciones/repositories/organizacion.repository';
import { OnboardingOngDto, OnboardingResponseDto } from '../dtos/onboarding-ong.dto';

const PREFIJO_CODIGO: Record<TipoOrganizacion, string> = {
  [TipoOrganizacion.ONG]: 'ONG',
  [TipoOrganizacion.ORGANISMO_RESCATE]: 'ORG',
};

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizacionRepository: OrganizacionRepository,
    private readonly passwordService: PasswordService,
  ) {}

  /**
   * Alta de la organizacion y de su cuenta de acceso, en una sola transaccion:
   * una organizacion sin cuenta, o una cuenta sin organizacion, no sirven.
   *
   * En esta entrega la organizacion queda HABILITADA desde el alta. El
   * circuito de aprobacion por la autoridad (PENDIENTE -> HABILITADA) llega
   * con el PATCH de estado, previsto para proximas entregas.
   */
  async registrar(dto: OnboardingOngDto): Promise<OnboardingResponseDto> {
    await this.validarUnicidad(dto);

    const passwordHash = await this.passwordService.hash(dto.password);

    const organizacion = await this.prisma.$transaction(async (tx) => {
      // El codigo sale del id, y el id recien se conoce al insertar: se crea
      // con un codigo provisorio y se reemplaza dentro de la misma transaccion.
      const creada = await this.organizacionRepository.create(
        {
          codigoNacional: `TMP-${randomUUID().slice(0, 16)}`,
          nombre: dto.nombre,
          tipo: dto.tipo,
          cuit: dto.cuit,
          estado: EstadoOrganizacion.HABILITADA,
        },
        tx,
      );

      const codigoNacional = `${PREFIJO_CODIGO[dto.tipo]}-${String(creada.id).padStart(4, '0')}`;

      await tx.cuenta.create({
        data: {
          email: dto.email,
          passwordHash,
          rol: RolCuenta.ONG,
          organizacionId: creada.id,
        },
      });

      return this.organizacionRepository.update(creada.id, { codigoNacional }, tx);
    });

    const respuesta = new OnboardingResponseDto();
    respuesta.codigoNacional = organizacion.codigoNacional;
    respuesta.nombre = organizacion.nombre;
    respuesta.tipo = organizacion.tipo;
    respuesta.estado = organizacion.estado;
    respuesta.email = dto.email;
    return respuesta;
  }

  /**
   * Chequeo previo con mensajes claros. Las restricciones unicas de la base
   * siguen siendo la garantia final ante dos altas simultaneas.
   */
  private async validarUnicidad(dto: OnboardingOngDto): Promise<void> {
    if (await this.organizacionRepository.existsByNombre(dto.nombre)) {
      throw new ConflictoException(`Ya existe una organizacion llamada "${dto.nombre}"`);
    }

    if (await this.organizacionRepository.existsByCuit(dto.cuit)) {
      throw new ConflictoException(`Ya existe una organizacion con el CUIT ${dto.cuit}`);
    }

    const cuentas = await this.prisma.cuenta.count({ where: { email: dto.email } });
    if (cuentas > 0) {
      throw new ConflictoException(`Ya existe una cuenta con el email ${dto.email}`);
    }
  }
}
