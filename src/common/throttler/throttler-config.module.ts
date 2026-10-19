import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule, seconds } from '@nestjs/throttler';

/**
 * Rate limiting a nivel HTTP, con contadores en memoria.
 *
 * El backend de la aplicacion web los guarda en Redis para que el limite sea
 * real con varias replicas. Aca hay una sola instancia en Railway y los
 * clientes son sistemas conocidos: Redis seria un servicio mas que mantener
 * sin beneficio.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          { name: 'short', ttl: seconds(1), limit: 20 },
          { name: 'long', ttl: seconds(60), limit: 300 },
        ],
        skipIf: (context) => {
          if (!config.get<boolean>('throttle.enabled', true)) return true;

          // El healthcheck lo consulta Railway en cada despliegue.
          const req = context.switchToHttp().getRequest<{ url?: string }>();
          return req.url?.includes('/health') ?? false;
        },
        errorMessage: 'Demasiadas peticiones. Intente nuevamente en unos segundos.',
      }),
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class ThrottlerConfigModule {}
