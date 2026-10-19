import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RolCuenta } from '@prisma/client';
import { CuentaActual, Roles } from '../../../common/decorators';
import { asegurarAccesoAOrganizacion } from '../../../security/acceso-organizacion';
import { CuentaAutenticada } from '../../../security/interfaces/jwt-payload.interface';
import { ActualizarRecursosDto, InventarioResponseDto } from '../dtos/recursos.dto';
import { RecursosService } from '../services/recursos.service';

@ApiTags('Recursos')
@ApiBearerAuth('access-token')
@Controller({ path: 'organizaciones/:codigo/recursos', version: '1' })
export class RecursosController {
  constructor(private readonly recursosService: RecursosService) {}

  @Get()
  @Roles(RolCuenta.SERVICIO, RolCuenta.ADMIN, RolCuenta.ONG)
  @ApiOperation({ summary: 'Inventario de una organizacion: total, comprometido y disponible' })
  @ApiResponse({ status: 200, type: InventarioResponseDto })
  getInventario(
    @Param('codigo') codigo: string,
    @CuentaActual() cuenta: CuentaAutenticada,
  ): Promise<InventarioResponseDto> {
    asegurarAccesoAOrganizacion(cuenta, codigo);
    return this.recursosService.getInventario(codigo);
  }

  @Put()
  @Roles(RolCuenta.SERVICIO, RolCuenta.ONG)
  @ApiOperation({ summary: 'Actualiza la cantidad total de las categorias informadas' })
  @ApiResponse({ status: 200, type: InventarioResponseDto })
  @ApiResponse({ status: 409, description: 'La nueva cantidad es menor a la comprometida' })
  actualizar(
    @Param('codigo') codigo: string,
    @Body() dto: ActualizarRecursosDto,
    @CuentaActual() cuenta: CuentaAutenticada,
  ): Promise<InventarioResponseDto> {
    asegurarAccesoAOrganizacion(cuenta, codigo);
    return this.recursosService.actualizar(codigo, dto);
  }
}
