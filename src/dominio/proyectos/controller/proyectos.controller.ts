import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { RolCuenta } from '@prisma/client';
import { Roles } from '../../../common/decorators';
import {
  CierreResponseDto,
  ComprometerRecursosDto,
  FaltanteDto,
  ProyectoResponseDto,
} from '../dtos/compromisos.dto';
import { ProyectosService } from '../services/proyectos.service';

@ApiTags('Proyectos')
@ApiBearerAuth('access-token')
@ApiExtraModels(FaltanteDto)
@ApiParam({
  name: 'ref',
  description: 'Referencia externa del proyecto: el caseId de Bonita',
  example: '20045',
})
@Controller({ path: 'proyectos/:ref', version: '1' })
export class ProyectosController {
  constructor(private readonly proyectosService: ProyectosService) {}

  @Post('compromisos')
  @Roles(RolCuenta.SERVICIO)
  @ApiOperation({
    summary: 'Compromete los recursos de las ONGs adjudicadas, con bloqueo transaccional',
    description:
      'Todo o nada: si a algun item no le alcanza el stock, responde 409 con los faltantes ' +
      'y no compromete nada. Si todas las ONGs ya estaban comprometidas, devuelve el estado ' +
      'actual sin cambios (reintento idempotente).',
  })
  @ApiResponse({ status: 201, type: ProyectoResponseDto })
  @ApiResponse({
    status: 409,
    description: 'Stock insuficiente, proyecto finalizado u organizacion no habilitada',
    schema: {
      properties: {
        status: { type: 'number', example: 409 },
        message: {
          type: 'string',
          example: 'Recursos insuficientes para comprometer el proyecto 20045',
        },
        faltantes: { type: 'array', items: { $ref: getSchemaPath(FaltanteDto) } },
        path: { type: 'string' },
        timestamp: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Alguna organizacion no existe' })
  comprometer(
    @Param('ref') referencia: string,
    @Body() dto: ComprometerRecursosDto,
  ): Promise<ProyectoResponseDto> {
    return this.proyectosService.comprometer(referencia, dto);
  }

  @Post('cerrar')
  @HttpCode(HttpStatus.OK)
  @Roles(RolCuenta.SERVICIO)
  @ApiOperation({
    summary: 'Cierra el proyecto y libera todos los recursos comprometidos',
    description: 'Idempotente: sobre un proyecto ya finalizado responde 200 con liberados vacio.',
  })
  @ApiResponse({ status: 200, type: CierreResponseDto })
  @ApiResponse({ status: 404, description: 'Proyecto inexistente' })
  cerrar(@Param('ref') referencia: string): Promise<CierreResponseDto> {
    return this.proyectosService.cerrar(referencia);
  }
}
