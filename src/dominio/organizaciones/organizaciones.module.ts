import { Module } from '@nestjs/common';
import { OrganizacionesController } from './controller/organizaciones.controller';
import { OrganizacionRepository } from './repositories/organizacion.repository';
import { OrganizacionesService } from './services/organizaciones.service';

/**
 * Exporta el servicio y el repositorio: onboarding crea organizaciones, y
 * recursos, validaciones y proyectos las resuelven por codigo nacional.
 */
@Module({
  controllers: [OrganizacionesController],
  providers: [OrganizacionesService, OrganizacionRepository],
  exports: [OrganizacionesService, OrganizacionRepository],
})
export class OrganizacionesModule {}
