import { ApiProperty } from '@nestjs/swagger';
import { CategoriaRecurso, NivelGravedad } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';

export class LineaValidacionDto {
  @ApiProperty({ example: 41, description: 'Id de la linea de oferta en la aplicacion web' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  lineaId!: number;

  @ApiProperty({ example: 'ONG-0001' })
  @IsString()
  @Length(3, 20)
  codigoNacional!: string;

  @ApiProperty({ enum: CategoriaRecurso, example: CategoriaRecurso.PERSONAL })
  @IsEnum(CategoriaRecurso)
  categoria!: CategoriaRecurso;

  @ApiProperty({ example: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cantidad!: number;
}

export class ValidarOfertasDto {
  @ApiProperty({ enum: NivelGravedad, example: NivelGravedad.ALTA })
  @IsEnum(NivelGravedad)
  gravedad!: NivelGravedad;

  @ApiProperty({ type: [LineaValidacionDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => LineaValidacionDto)
  lineas!: LineaValidacionDto[];
}

/**
 * Los tres primeros campos son exactamente los que espera
 * POST /emergencias/:id/ofertas/validar de la aplicacion web, asi Bonita
 * reenvia la respuesta sin transformarla. El resto es detalle informativo.
 */
export class ResultadoValidacionDto {
  @ApiProperty({ example: 41 })
  lineaId!: number;

  @ApiProperty({ enum: ['PRINCIPAL', 'APOYO_SECUNDARIO'], example: 'PRINCIPAL' })
  caracter!: 'PRINCIPAL' | 'APOYO_SECUNDARIO';

  @ApiProperty({ example: 'Rescate acuatico nivel 3 - habilitada hasta gravedad ALTA' })
  perfilCompetencia!: string;

  @ApiProperty({ enum: CategoriaRecurso, isArray: true, example: [CategoriaRecurso.PERSONAL] })
  capacidadesHabilitadas!: CategoriaRecurso[];

  @ApiProperty({ enum: NivelGravedad, nullable: true, example: NivelGravedad.ALTA })
  nivelRiesgoPermitido!: NivelGravedad | null;

  @ApiProperty({ example: true, description: 'Si hoy alcanza el stock. No bloquea nada.' })
  disponible!: boolean;

  @ApiProperty({ example: 15 })
  cantidadDisponible!: number;
}

export class ValidacionResponseDto {
  @ApiProperty({ type: [ResultadoValidacionDto] })
  resultados!: ResultadoValidacionDto[];
}
