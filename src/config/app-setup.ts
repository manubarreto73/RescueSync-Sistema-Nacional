import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AllExceptionsFilter } from '../common/filters/all-exceptions.filter';

/**
 * Configuracion transversal: prefijo, versionado, CORS, validacion y manejo
 * de errores.
 *
 * Vive aca y no en main.ts porque los tests e2e levantan la app con su propio
 * bootstrap: si la configuraran distinto, estarian probando una API que no es
 * la que se despliega.
 */
export function configurarApp(app: INestApplication, config: ConfigService): void {
  const prefix = config.get<string>('app.apiPrefix', 'api');

  // Railway pone un proxy delante: sin esto req.ip seria siempre la del proxy
  // y el rate limiting contaria todo el trafico como un unico cliente.
  (app as NestExpressApplication).set('trust proxy', 1);

  app.setGlobalPrefix(prefix);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.use(helmet());

  app.enableCors({
    origin: config.get<string[]>('cors.allowedOrigins'),
    methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
  });

  /**
   * whitelist + forbidNonWhitelisted: un campo que el DTO no declara es un
   * error del cliente, no algo que se descarta en silencio.
   */
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  // Cierra las conexiones de Postgres al recibir SIGTERM (redeploy en Railway).
  app.enableShutdownHooks();
}
