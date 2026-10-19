import { Prisma } from '@prisma/client';

/**
 * Cliente transaccional de Prisma. La transaccion no viaja implicita: los
 * repositorios lo reciben como parametro opcional para participar de una
 * transaccion abierta por el servicio.
 */
export type PrismaTransaction = Prisma.TransactionClient;
