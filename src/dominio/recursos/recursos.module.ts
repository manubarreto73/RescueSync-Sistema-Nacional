import { Module } from '@nestjs/common';
import { OrganizacionesModule } from '../organizaciones/organizaciones.module';
import { RecursosController } from './controller/recursos.controller';
import { RecursoRepository } from './repositories/recurso.repository';
import { RecursosService } from './services/recursos.service';

/** Exporta el repositorio: validaciones y proyectos leen y bloquean recursos. */
@Module({
  imports: [OrganizacionesModule],
  controllers: [RecursosController],
  providers: [RecursosService, RecursoRepository],
  exports: [RecursoRepository],
})
export class RecursosModule {}
