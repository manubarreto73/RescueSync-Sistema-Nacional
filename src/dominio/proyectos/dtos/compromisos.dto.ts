import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CategoriaRecurso, EstadoCompromiso, EstadoProyecto, NivelGravedad } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { CompromisoDetalle, ProyectoDetalle } from '../repositories/proyecto.repository';

export class ItemCompromisoDto {
  @ApiProperty({ enum: CategoriaRecurso, example: CategoriaRecurso.PERSONAL })
  @IsEnum(CategoriaRecurso)
  categoria!: CategoriaRecurso;

  @ApiProperty({ example: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000_000)
  cantidad!: number;
}

export class CompromisoInputDto {
  @ApiProperty({ example: 'ONG-0001' })
  @IsString()
  @Length(3, 20)
  codigoNacional!: string;

  @ApiProperty({ type: [ItemCompromisoDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(Object.keys(CategoriaRecurso).length)
  @ValidateNested({ each: true })
  @Type(() => ItemCompromisoDto)
  items!: ItemCompromisoDto[];
}

/**
 * Es el compromisosJson que la aplicacion web le pasa a Bonita en el
 * contrato de la tarea "Adjudicar ofertas": una entrada por ONG adjudicada.
 */
export class ComprometerRecursosDto {
  @ApiProperty({ enum: NivelGravedad, example: NivelGravedad.ALTA })
  @IsEnum(NivelGravedad)
  gravedad!: NivelGravedad;

  @ApiProperty({ type: [CompromisoInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CompromisoInputDto)
  compromisos!: CompromisoInputDto[];
}

export class ItemResponseDto {
  @ApiProperty({ enum: CategoriaRecurso })
  categoria!: CategoriaRecurso;

  @ApiProperty({ example: 5 })
  cantidad!: number;
}

export class CompromisoResponseDto {
  @ApiProperty({ example: 7 })
  id!: number;

  @ApiProperty({ example: 'ONG-0001' })
  codigoNacional!: string;

  @ApiProperty({ enum: EstadoCompromiso })
  estado!: EstadoCompromiso;

  @ApiProperty({ type: [ItemResponseDto] })
  items!: ItemResponseDto[];

  static from(compromiso: CompromisoDetalle): CompromisoResponseDto {
    const dto = new CompromisoResponseDto();
    dto.id = compromiso.id;
    dto.codigoNacional = compromiso.organizacion.codigoNacional;
    dto.estado = compromiso.estado;
    dto.items = compromiso.items.map((i) => ({
      categoria: i.recurso.categoria,
      cantidad: i.cantidad,
    }));
    return dto;
  }
}

export class ProyectoResponseDto {
  @ApiProperty({ example: '20045', description: 'caseId de Bonita' })
  referencia!: string;

  @ApiProperty({ enum: EstadoProyecto })
  estado!: EstadoProyecto;

  @ApiProperty({ enum: NivelGravedad })
  gravedad!: NivelGravedad;

  @ApiProperty()
  fechaInicio!: Date;

  @ApiPropertyOptional({ nullable: true })
  fechaCierre!: Date | null;

  @ApiProperty({ type: [CompromisoResponseDto] })
  compromisos!: CompromisoResponseDto[];

  static from(proyecto: ProyectoDetalle): ProyectoResponseDto {
    const dto = new ProyectoResponseDto();
    dto.referencia = proyecto.referenciaExterna;
    dto.estado = proyecto.estado;
    dto.gravedad = proyecto.gravedad;
    dto.fechaInicio = proyecto.fechaInicio;
    dto.fechaCierre = proyecto.fechaCierre;
    dto.compromisos = proyecto.compromisos.map(CompromisoResponseDto.from);
    return dto;
  }
}

export class LiberacionDto {
  @ApiProperty({ example: 'ONG-0001' })
  codigoNacional!: string;

  @ApiProperty({ type: [ItemResponseDto] })
  items!: ItemResponseDto[];
}

export class CierreResponseDto {
  @ApiProperty({ example: '20045' })
  referencia!: string;

  @ApiProperty({ enum: EstadoProyecto, example: EstadoProyecto.FINALIZADO })
  estado!: EstadoProyecto;

  @ApiProperty()
  fechaCierre!: Date;

  @ApiProperty({
    type: [LiberacionDto],
    description: 'Lo liberado en esta llamada. Vacio si el proyecto ya estaba finalizado.',
  })
  liberados!: LiberacionDto[];
}

/** Detalle del 409 por stock insuficiente, para documentarlo en Swagger. */
export class FaltanteDto {
  @ApiProperty({ example: 'ONG-0003' })
  codigoNacional!: string;

  @ApiProperty({ enum: CategoriaRecurso })
  categoria!: CategoriaRecurso;

  @ApiProperty({ example: 600 })
  pedido!: number;

  @ApiProperty({ example: 250 })
  disponible!: number;
}
