import { Module } from '@nestjs/common';
import { OrganizacionesModule } from '../organizaciones/organizaciones.module';
import { RecursosModule } from '../recursos/recursos.module';
import { ProyectosController } from './controller/proyectos.controller';
import { ProyectoRepository } from './repositories/proyecto.repository';
import { ProyectosService } from './services/proyectos.service';

@Module({
  imports: [OrganizacionesModule, RecursosModule],
  controllers: [ProyectosController],
  providers: [ProyectosService, ProyectoRepository],
})
export class ProyectosModule {}
