import path from 'node:path';
import 'dotenv/config';
import type { PrismaConfig } from 'prisma';

/**
 * Configuracion del CLI de Prisma: migraciones, generate, studio y seed.
 * La app en runtime no lee este archivo.
 */
export default {
  // Carpeta, no archivo: Prisma concatena todos los .prisma que encuentre.
  schema: path.join('prisma', 'schema'),

  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'ts-node src/seed/seed.ts',
  },
} satisfies PrismaConfig;
