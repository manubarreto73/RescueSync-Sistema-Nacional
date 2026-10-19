import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 0, description: 'Numero de pagina (base 0)' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  page: number = 0;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  size: number = 20;

  @ApiPropertyOptional({ description: 'Busca en nombre y codigo nacional' })
  @IsString()
  @IsOptional()
  busqueda?: string;

  get skip(): number {
    return this.page * this.size;
  }
}
