import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RolCuenta } from '@prisma/client';
import { Roles } from '../../../common/decorators';
import { ValidacionResponseDto, ValidarOfertasDto } from '../dtos/validacion.dto';
import { ValidacionesService } from '../services/validaciones.service';

@ApiTags('Validaciones')
@ApiBearerAuth('access-token')
@Controller({ path: 'validaciones', version: '1' })
export class ValidacionesController {
  constructor(private readonly validacionesService: ValidacionesService) {}

  /** 200 y no 201: evalua, no crea nada. */
  @Post()
  @HttpCode(HttpStatus.OK)
  @Roles(RolCuenta.SERVICIO)
  @ApiOperation({
    summary: 'Valida lineas de oferta por nivel de competencia (sin rechazo binario)',
    description:
      'Cada linea vuelve como PRINCIPAL o APOYO_SECUNDARIO con su perfil de competencia. ' +
      'Lo invoca Bonita al vencer la ventana de la convocatoria.',
  })
  @ApiResponse({ status: 200, type: ValidacionResponseDto })
  validar(@Body() dto: ValidarOfertasDto): Promise<ValidacionResponseDto> {
    return this.validacionesService.validar(dto);
  }
}
