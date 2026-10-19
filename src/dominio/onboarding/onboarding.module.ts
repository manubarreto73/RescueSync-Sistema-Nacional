import { Module } from '@nestjs/common';
import { OrganizacionesModule } from '../organizaciones/organizaciones.module';
import { OnboardingController } from './controller/onboarding.controller';
import { OnboardingService } from './services/onboarding.service';

@Module({
  imports: [OrganizacionesModule],
  controllers: [OnboardingController],
  providers: [OnboardingService],
})
export class OnboardingModule {}
