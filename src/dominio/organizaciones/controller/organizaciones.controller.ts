import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RolCuenta } from '@prisma/client';
import { CuentaActual, Roles } from '../../../common/decorators';
import { PageResponse } from '../../../common/dtos/page-response.dto';
import { asegurarAccesoAOrganizacion } from '../../../security/acceso-organizacion';
import { CuentaAutenticada } from '../../../security/interfaces/jwt-payload.interface';
import { FindOrganizacionesQuery } from '../dtos/find-organizaciones.query';
import { OrganizacionDetalleDto, OrganizacionResponseDto } from '../dtos/organizacion-response.dto';
import { OrganizacionesService } from '../services/organizaciones.service';

@ApiTags('Organizaciones')
@ApiBearerAuth('access-token')
@Controller({ path: 'organizaciones', version: '1' })
export class OrganizacionesController {
  constructor(private readonly organizacionesService: OrganizacionesService) {}

  @Get()
  @Roles(RolCuenta.SERVICIO, RolCuenta.ADMIN)
  @ApiOperation({ summary: 'Lista las organizaciones registradas, filtrables por estado' })
  getAll(@Query() query: FindOrganizacionesQuery): Promise<PageResponse<OrganizacionResponseDto>> {
    return this.organizacionesService.getAll(query);
  }

  @Get(':codigo')
  @Roles(RolCuenta.SERVICIO, RolCuenta.ADMIN, RolCuenta.ONG)
  @ApiOperation({ summary: 'Detalle de una organizacion con sus certificaciones vigentes' })
  @ApiResponse({ status: 200, type: OrganizacionDetalleDto })
  @ApiResponse({ status: 403, description: 'Una cuenta ONG consultando otra organizacion' })
  @ApiResponse({ status: 404, description: 'Organizacion inexistente' })
  getDetalle(
    @Param('codigo') codigo: string,
    @CuentaActual() cuenta: CuentaAutenticada,
  ): Promise<OrganizacionDetalleDto> {
    asegurarAccesoAOrganizacion(cuenta, codigo);
    return this.organizacionesService.getDetalle(codigo);
  }
}
