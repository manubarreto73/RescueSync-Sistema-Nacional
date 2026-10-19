import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EstadoOrganizacion, TipoOrganizacion } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator';

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class OnboardingOngDto {
  @ApiProperty({ example: 'Bomberos Voluntarios de Berisso' })
  @Transform(recortar)
  @IsString()
  @Length(3, 150)
  nombre!: string;

  @ApiPropertyOptional({ enum: TipoOrganizacion, default: TipoOrganizacion.ONG })
  @IsEnum(TipoOrganizacion)
  @IsOptional()
  tipo: TipoOrganizacion = TipoOrganizacion.ONG;

  @ApiProperty({ example: '30712345678', description: 'CUIT de 11 digitos, sin guiones' })
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/-/g, '').trim() : value))
  @Matches(/^\d{11}$/, { message: 'El CUIT debe tener 11 digitos' })
  cuit!: string;

  @ApiProperty({ example: 'contacto@bvberisso.org', description: 'Email de la cuenta de acceso' })
  @IsEmail({}, { message: 'El email no tiene un formato valido' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;

  @ApiProperty({ example: 'Berisso2026!' })
  @IsString()
  @Length(8, 72)
  password!: string;
}

export class OnboardingResponseDto {
  @ApiProperty({ example: 'ONG-0005', description: 'Identificador compartido por todo RescueSync' })
  codigoNacional!: string;

  @ApiProperty({ example: 'Bomberos Voluntarios de Berisso' })
  nombre!: string;

  @ApiProperty({ enum: TipoOrganizacion })
  tipo!: TipoOrganizacion;

  @ApiProperty({ enum: EstadoOrganizacion, example: EstadoOrganizacion.HABILITADA })
  estado!: EstadoOrganizacion;

  @ApiProperty({ example: 'contacto@bvberisso.org' })
  email!: string;
}
