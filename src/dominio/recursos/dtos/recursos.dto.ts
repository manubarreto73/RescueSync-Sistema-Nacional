import { ApiProperty } from '@nestjs/swagger';
import { CategoriaRecurso, Recurso } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
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

export class RecursoInputDto {
  @ApiProperty({ enum: CategoriaRecurso, example: CategoriaRecurso.PERSONAL })
  @IsEnum(CategoriaRecurso)
  categoria!: CategoriaRecurso;

  @ApiProperty({ example: 'personas' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 30)
  unidad!: string;

  @ApiProperty({ example: 20, minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  cantidadTotal!: number;
}

/**
 * Las categorias que no vienen en el request quedan como estaban: el PUT
 * reemplaza la cantidad total de cada categoria informada, no el inventario
 * entero.
 */
export class ActualizarRecursosDto {
  @ApiProperty({ type: [RecursoInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(Object.keys(CategoriaRecurso).length)
  @ValidateNested({ each: true })
  @Type(() => RecursoInputDto)
  recursos!: RecursoInputDto[];
}

export class RecursoResponseDto {
  @ApiProperty({ enum: CategoriaRecurso })
  categoria!: CategoriaRecurso;

  @ApiProperty({ example: 'personas' })
  unidad!: string;

  @ApiProperty({ example: 20 })
  cantidadTotal!: number;

  @ApiProperty({ example: 5 })
  cantidadComprometida!: number;

  @ApiProperty({ example: 15, description: 'cantidadTotal - cantidadComprometida' })
  disponible!: number;

  static from(recurso: Recurso): RecursoResponseDto {
    const dto = new RecursoResponseDto();
    dto.categoria = recurso.categoria;
    dto.unidad = recurso.unidad;
    dto.cantidadTotal = recurso.cantidadTotal;
    dto.cantidadComprometida = recurso.cantidadComprometida;
    dto.disponible = recurso.cantidadTotal - recurso.cantidadComprometida;
    return dto;
  }
}

export class InventarioResponseDto {
  @ApiProperty({ example: 'ONG-0001' })
  codigoNacional!: string;

  @ApiProperty({ type: [RecursoResponseDto] })
  recursos!: RecursoResponseDto[];
}
