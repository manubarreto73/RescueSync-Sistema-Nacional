import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configurarApp } from '../../src/config/app-setup';
import { PrismaService } from '../../src/prisma/prisma.service';

export const BASE = '/api/v1';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
}

/**
 * Levanta la aplicacion completa en memoria, con la base de tests real y la
 * misma configuracion que main.ts.
 */
export async function crearAppDeTest(): Promise<TestContext> {
  process.env.THROTTLE_ENABLED = 'false';

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configurarApp(app, app.get(ConfigService));
  await app.init();

  return { app, prisma: app.get(PrismaService) };
}

export async function cerrarApp(ctx: TestContext): Promise<void> {
  await ctx.app.close();
}

/** Login real por HTTP: pasa por la misma puerta que un cliente. */
export async function login(app: INestApplication, email: string, password: string): Promise<string> {
  const res = await request(app.getHttpServer()).post(`${BASE}/auth/login`).send({ email, password });

  if (res.status !== 200) {
    throw new Error(`Login fallido para ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }

  return res.body.accessToken as string;
}

export function bearer(token: string): string {
  return `Bearer ${token}`;
}
