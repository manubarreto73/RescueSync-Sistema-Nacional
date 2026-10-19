import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';
import { Public } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Lo consulta Railway en cada despliegue (railway.json > healthcheckPath):
 * hasta que no responde 200, la version nueva no recibe trafico.
 */
@ApiTags('Health')
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Estado de la API y de su base de datos' })
  check() {
    return this.health.check([() => this.prismaIndicator.pingCheck('postgres', this.prisma)]);
  }
}
