import { ApiProperty } from '@nestjs/swagger';
import {
  CategoriaRecurso,
  EstadoOrganizacion,
  Organizacion,
  TipoOrganizacion,
} from '@prisma/client';
import { OrganizacionConCertificaciones } from '../repositories/organizacion.repository';

export class OrganizacionResponseDto {
  @ApiProperty({ example: 'ONG-0001' })
  codigoNacional!: string;

  @ApiProperty({ example: 'Cruz Solidaria' })
  nombre!: string;

  @ApiProperty({ enum: TipoOrganizacion })
  tipo!: TipoOrganizacion;

  @ApiProperty({ example: '30700000002' })
  cuit!: string;

  @ApiProperty({ enum: EstadoOrganizacion })
  estado!: EstadoOrganizacion;

  @ApiProperty()
  fechaAlta!: Date;

  static from(organizacion: Organizacion): OrganizacionResponseDto {
    const dto = new OrganizacionResponseDto();
    dto.codigoNacional = organizacion.codigoNacional;
    dto.nombre = organizacion.nombre;
    dto.tipo = organizacion.tipo;
    dto.cuit = organizacion.cuit;
    dto.estado = organizacion.estado;
    dto.fechaAlta = organizacion.fechaAlta;
    return dto;
  }
}

export class CertificacionVigenteDto {
  @ApiProperty({ example: 'PRIM-AUX' })
  codigo!: string;

  @ApiProperty({ example: 'Primeros auxilios' })
  nombre!: string;

  @ApiProperty({ enum: CategoriaRecurso })
  categoria!: CategoriaRecurso;

  @ApiProperty({ example: 3, minimum: 1, maximum: 4 })
  nivel!: number;

  @ApiProperty({ example: '2027-06-30' })
  fechaVencimiento!: string;
}

export class OrganizacionDetalleDto extends OrganizacionResponseDto {
  @ApiProperty({ type: [CertificacionVigenteDto] })
  certificaciones!: CertificacionVigenteDto[];

  static fromDetalle(organizacion: OrganizacionConCertificaciones): OrganizacionDetalleDto {
    const dto = Object.assign(
      new OrganizacionDetalleDto(),
      OrganizacionResponseDto.from(organizacion),
    );
    dto.certificaciones = organizacion.certificaciones.map((otorgada) => ({
      codigo: otorgada.certificacion.codigo,
      nombre: otorgada.certificacion.nombre,
      categoria: otorgada.certificacion.categoria,
      nivel: otorgada.nivel,
      fechaVencimiento: otorgada.fechaVencimiento.toISOString().slice(0, 10),
    }));
    return dto;
  }
}
