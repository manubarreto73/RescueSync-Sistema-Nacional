import { ApiPropertyOptional } from '@nestjs/swagger';
import { EstadoOrganizacion } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dtos/pagination-query.dto';

export class FindOrganizacionesQuery extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: EstadoOrganizacion, example: EstadoOrganizacion.HABILITADA })
  @IsEnum(EstadoOrganizacion)
  @IsOptional()
  estado?: EstadoOrganizacion;
}
