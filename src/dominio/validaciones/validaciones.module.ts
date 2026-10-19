import { Module } from '@nestjs/common';
import { ValidacionesController } from './controller/validaciones.controller';
import { ValidacionesService } from './services/validaciones.service';

@Module({
  controllers: [ValidacionesController],
  providers: [ValidacionesService],
})
export class ValidacionesModule {}
