import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerConfigModule } from './common/throttler/throttler-config.module';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { AuthModule } from './dominio/auth/auth.module';
import { OnboardingModule } from './dominio/onboarding/onboarding.module';
import { OrganizacionesModule } from './dominio/organizaciones/organizaciones.module';
import { ProyectosModule } from './dominio/proyectos/proyectos.module';
import { RecursosModule } from './dominio/recursos/recursos.module';
import { ValidacionesModule } from './dominio/validaciones/validaciones.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { SecurityModule } from './security/security.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
      envFilePath: ['.env'],
      cache: true,
    }),

    PrismaModule,

    // Antes que SecurityModule: conviene descartar por 429 antes de gastar
    // CPU verificando la firma de un JWT.
    ThrottlerConfigModule,

    SecurityModule,
    HealthModule,

    // --- Modulos de dominio ---
    AuthModule,
    OnboardingModule,
    OrganizacionesModule,
    RecursosModule,
    ValidacionesModule,
    ProyectosModule,
  ],
})
export class AppModule {}
