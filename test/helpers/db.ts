import {
  CategoriaRecurso,
  EstadoOrganizacion,
  RolCuenta,
  TipoOrganizacion,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../src/prisma/prisma.service';

export const PASSWORD_TEST = 'Rescue2026!';

export const EMAIL_ADMIN = 'admin@test.ar';
export const EMAIL_SERVICIO = 'bonita@test.ar';
export const EMAIL_ONG_1 = 'ong1@test.ar';
export const EMAIL_ONG_2 = 'org2@test.ar';
export const EMAIL_INACTIVA = 'inactiva@test.ar';

export const ONG_1 = 'ONG-0001';
export const ORG_2 = 'ORG-0002';
export const ONG_SUSPENDIDA = 'ONG-0003';

const VIGENTE = new Date('2099-12-31T00:00:00Z');
const VENCIDA = new Date('2020-01-31T00:00:00Z');

/**
 * Las tablas se truncan con RESTART IDENTITY antes de cada test: los ids, y
 * por lo tanto el codigo nacional que genera el onboarding, son deterministas.
 */
export async function limpiarBase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "compromiso_items", "compromisos", "proyectos", "recursos", ' +
      '"organizacion_certificaciones", "certificaciones", "cuentas", "organizaciones" ' +
      'RESTART IDENTITY CASCADE',
  );
}

/**
 * Estado base de cada test:
 *  - ONG-0001: habilitada, Primeros auxilios nivel 3. PERSONAL 20, ALIMENTOS 1000.
 *  - ORG-0002: habilitada, Primeros auxilios nivel 1 y Manipulacion de
 *    alimentos vencida. PERSONAL 3 (el recurso del test de concurrencia).
 *  - ONG-0003: suspendida. ALIMENTOS 100.
 */
export async function sembrarDatos(prisma: PrismaService): Promise<void> {
  await prisma.organizacion.createMany({
    data: [
      { codigoNacional: ONG_1, nombre: 'Cruz Solidaria', tipo: TipoOrganizacion.ONG, cuit: '30111111111' },
      {
        codigoNacional: ORG_2,
        nombre: 'Bomberos de Test',
        tipo: TipoOrganizacion.ORGANISMO_RESCATE,
        cuit: '30222222222',
      },
      {
        codigoNacional: ONG_SUSPENDIDA,
        nombre: 'ONG Suspendida',
        tipo: TipoOrganizacion.ONG,
        cuit: '30333333333',
        estado: EstadoOrganizacion.SUSPENDIDA,
      },
    ],
  });

  const passwordHash = await bcrypt.hash(PASSWORD_TEST, 4);

  await prisma.cuenta.createMany({
    data: [
      { email: EMAIL_ADMIN, passwordHash, rol: RolCuenta.ADMIN },
      { email: EMAIL_SERVICIO, passwordHash, rol: RolCuenta.SERVICIO },
      { email: EMAIL_ONG_1, passwordHash, rol: RolCuenta.ONG, organizacionId: 1 },
      { email: EMAIL_ONG_2, passwordHash, rol: RolCuenta.ONG, organizacionId: 2 },
      { email: EMAIL_INACTIVA, passwordHash, rol: RolCuenta.SERVICIO, activa: false },
    ],
  });

  await prisma.certificacion.createMany({
    data: [
      { codigo: 'PRIM-AUX', nombre: 'Primeros auxilios', categoria: CategoriaRecurso.PERSONAL },
      { codigo: 'MANIP-ALI', nombre: 'Manipulacion de alimentos', categoria: CategoriaRecurso.ALIMENTOS },
    ],
  });

  await prisma.organizacionCertificacion.createMany({
    data: [
      { organizacionId: 1, certificacionId: 1, nivel: 3, fechaVencimiento: VIGENTE },
      { organizacionId: 2, certificacionId: 1, nivel: 1, fechaVencimiento: VIGENTE },
      { organizacionId: 2, certificacionId: 2, nivel: 4, fechaVencimiento: VENCIDA },
    ],
  });

  await prisma.recurso.createMany({
    data: [
      { organizacionId: 1, categoria: CategoriaRecurso.PERSONAL, unidad: 'personas', cantidadTotal: 20 },
      { organizacionId: 1, categoria: CategoriaRecurso.ALIMENTOS, unidad: 'raciones', cantidadTotal: 1000 },
      { organizacionId: 2, categoria: CategoriaRecurso.PERSONAL, unidad: 'personas', cantidadTotal: 3 },
      { organizacionId: 3, categoria: CategoriaRecurso.ALIMENTOS, unidad: 'raciones', cantidadTotal: 100 },
    ],
  });
}

export async function resetearEstado(prisma: PrismaService): Promise<void> {
  await limpiarBase(prisma);
  await sembrarDatos(prisma);
}

/** Lo comprometido de un recurso, leido directo de la base. */
export async function comprometido(
  prisma: PrismaService,
  organizacionId: number,
  categoria: CategoriaRecurso,
): Promise<number> {
  const recurso = await prisma.recurso.findUniqueOrThrow({
    where: { organizacionId_categoria: { organizacionId, categoria } },
  });
  return recurso.cantidadComprometida;
}
