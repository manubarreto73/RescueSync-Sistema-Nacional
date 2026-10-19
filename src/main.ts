import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configurarApp } from './config/app-setup';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  const port = config.get<number>('app.port', 3001);
  const prefix = config.get<string>('app.apiPrefix', 'api');

  configurarApp(app, config);

  if (config.get<boolean>('app.swaggerEnabled')) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Sistema Nacional de Gestion de Recursos y Riesgos')
      .setDescription(
        'API externa de RescueSync - Sistemas Distribuidos 2026.\n\n' +
          'Autenticacion: `POST /api/v1/auth/login` devuelve un JWT; se usa con el boton ' +
          '**Authorize** como `Bearer <token>`.',
      )
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig, {
      operationIdFactory: (controllerKey: string, methodKey: string) =>
        `${controllerKey}_${methodKey}`,
    });
    SwaggerModule.setup(`${prefix}/docs`, app, document, {
      swaggerOptions: { persistAuthorization: true },
      jsonDocumentUrl: `${prefix}/docs-json`,
    });
  }

  await app.listen(port, '0.0.0.0');
  logger.log(`API escuchando en http://localhost:${port}/${prefix}/v1`);
  logger.log(`Swagger en http://localhost:${port}/${prefix}/docs`);
}

void bootstrap();
