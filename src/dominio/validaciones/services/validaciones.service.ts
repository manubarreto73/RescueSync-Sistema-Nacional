import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { hoy } from '../../organizaciones/services/organizaciones.service';
import { ValidacionResponseDto, ValidarOfertasDto } from '../dtos/validacion.dto';
import { OrganizacionAEvaluar, evaluarLinea } from '../reglas-competencia';

@Injectable()
export class ValidacionesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Evalua todas las lineas con una sola consulta: las organizaciones
   * involucradas con sus certificaciones (vigentes y vencidas, para poder
   * explicar el motivo) y su inventario.
   *
   * No toma locks: es una lectura informativa. El stock se garantiza recien
   * al comprometer.
   */
  async validar(dto: ValidarOfertasDto): Promise<ValidacionResponseDto> {
    const codigos = [...new Set(dto.lineas.map((l) => l.codigoNacional))];

    const organizaciones = await this.prisma.organizacion.findMany({
      where: { codigoNacional: { in: codigos } },
      include: {
        certificaciones: { include: { certificacion: true } },
        recursos: true,
      },
    });

    const porCodigo = new Map<string, OrganizacionAEvaluar>(
      organizaciones.map((o) => [
        o.codigoNacional,
        {
          estado: o.estado,
          certificaciones: o.certificaciones.map((c) => ({
            nombre: c.certificacion.nombre,
            categoria: c.certificacion.categoria,
            nivel: c.nivel,
            fechaVencimiento: c.fechaVencimiento,
          })),
          recursos: o.recursos,
        },
      ]),
    );

    const fecha = hoy();

    return {
      resultados: dto.lineas.map((linea) =>
        evaluarLinea(linea, dto.gravedad, porCodigo.get(linea.codigoNacional) ?? null, fecha),
      ),
    };
  }
}
