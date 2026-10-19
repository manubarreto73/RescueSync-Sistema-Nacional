import 'dotenv/config';
import {
  CategoriaRecurso,
  EstadoOrganizacion,
  PrismaClient,
  RolCuenta,
  TipoOrganizacion,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

/**
 * Datos iniciales: cuentas de servicio, catalogo de certificaciones y ONGs
 * de demostracion.
 *
 * Corre en cada arranque del contenedor (ver CMD del Dockerfile), asi que es
 * idempotente: todo es upsert. Lo que el sistema modifica en uso (estado de
 * las organizaciones, inventario, lo comprometido) se crea una sola vez y no
 * se pisa en los arranques siguientes.
 *
 * Vive en src/ y no en prisma/ para que `nest build` lo compile: la imagen
 * de produccion no tiene ts-node.
 *
 * Los codigos nacionales de las ONGs coinciden con los del seed de la
 * aplicacion web (Cruz Solidaria = ONG-0001, Bomberos de Cosquin = ORG-0002):
 * es lo que permite probar el circuito completo sin cargar nada a mano.
 */
const prisma = new PrismaClient();

const esProduccion = process.env.NODE_ENV === 'production';
const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS ?? '10', 10);

const certificaciones = [
  { codigo: 'PRIM-AUX', nombre: 'Primeros auxilios', categoria: CategoriaRecurso.PERSONAL },
  { codigo: 'RESC-ACU', nombre: 'Rescate acuatico', categoria: CategoriaRecurso.PERSONAL },
  {
    codigo: 'RESC-URB',
    nombre: 'Rescate en estructuras colapsadas',
    categoria: CategoriaRecurso.PERSONAL,
  },
  {
    codigo: 'MANIP-ALI',
    nombre: 'Manipulacion de alimentos',
    categoria: CategoriaRecurso.ALIMENTOS,
  },
  {
    codigo: 'POTAB',
    nombre: 'Potabilizacion y distribucion de agua',
    categoria: CategoriaRecurso.AGUA_POTABLE,
  },
  {
    codigo: 'FARM',
    nombre: 'Gestion de medicamentos e insumos sanitarios',
    categoria: CategoriaRecurso.MEDICAMENTOS,
  },
  {
    codigo: 'REFUGIO',
    nombre: 'Gestion de refugios y evacuados',
    categoria: CategoriaRecurso.ABRIGO_Y_REFUGIO,
  },
  {
    codigo: 'EQUIP',
    nombre: 'Operacion de equipamiento pesado',
    categoria: CategoriaRecurso.EQUIPAMIENTO,
  },
  {
    codigo: 'LOGIST',
    nombre: 'Logistica y transporte en emergencias',
    categoria: CategoriaRecurso.TRANSPORTE_Y_LOGISTICA,
  },
];

const VIGENTE = new Date('2027-12-31T00:00:00Z');
const VENCIDA = new Date('2026-01-31T00:00:00Z');

interface OrganizacionDemo {
  codigoNacional: string;
  nombre: string;
  tipo: TipoOrganizacion;
  cuit: string;
  estado: EstadoOrganizacion;
  email: string;
  certificaciones: { codigo: string; nivel: number; vence: Date }[];
  recursos: { categoria: CategoriaRecurso; unidad: string; cantidadTotal: number }[];
}

const organizaciones: OrganizacionDemo[] = [
  {
    codigoNacional: 'ONG-0001',
    nombre: 'Cruz Solidaria',
    tipo: TipoOrganizacion.ONG,
    cuit: '30700000002',
    estado: EstadoOrganizacion.HABILITADA,
    email: 'contacto@cruzsolidaria.org',
    certificaciones: [
      { codigo: 'PRIM-AUX', nivel: 3, vence: VIGENTE },
      { codigo: 'MANIP-ALI', nivel: 4, vence: VIGENTE },
      { codigo: 'REFUGIO', nivel: 2, vence: VIGENTE },
    ],
    recursos: [
      { categoria: CategoriaRecurso.PERSONAL, unidad: 'personas', cantidadTotal: 20 },
      { categoria: CategoriaRecurso.ALIMENTOS, unidad: 'raciones', cantidadTotal: 5000 },
      { categoria: CategoriaRecurso.ABRIGO_Y_REFUGIO, unidad: 'frazadas', cantidadTotal: 300 },
    ],
  },
  {
    codigoNacional: 'ORG-0002',
    nombre: 'Bomberos Voluntarios de Cosquin',
    tipo: TipoOrganizacion.ORGANISMO_RESCATE,
    cuit: '30700000003',
    estado: EstadoOrganizacion.HABILITADA,
    email: 'guardia@bvcosquin.org.ar',
    certificaciones: [
      { codigo: 'RESC-ACU', nivel: 4, vence: VIGENTE },
      { codigo: 'RESC-URB', nivel: 3, vence: VIGENTE },
      { codigo: 'PRIM-AUX', nivel: 2, vence: VIGENTE },
      { codigo: 'LOGIST', nivel: 3, vence: VIGENTE },
    ],
    recursos: [
      { categoria: CategoriaRecurso.PERSONAL, unidad: 'personas', cantidadTotal: 35 },
      { categoria: CategoriaRecurso.TRANSPORTE_Y_LOGISTICA, unidad: 'vehiculos', cantidadTotal: 6 },
      { categoria: CategoriaRecurso.EQUIPAMIENTO, unidad: 'unidades', cantidadTotal: 10 },
    ],
  },
  {
    // Certificaciones de nivel bajo y una vencida: sus ofertas salen como
    // apoyo secundario en emergencias graves.
    codigoNacional: 'ONG-0003',
    nombre: 'Red Solidaria Sierras Chicas',
    tipo: TipoOrganizacion.ONG,
    cuit: '30700000005',
    estado: EstadoOrganizacion.HABILITADA,
    email: 'info@redsierraschicas.org',
    certificaciones: [
      { codigo: 'PRIM-AUX', nivel: 1, vence: VIGENTE },
      { codigo: 'POTAB', nivel: 2, vence: VIGENTE },
      { codigo: 'FARM', nivel: 3, vence: VENCIDA },
    ],
    recursos: [
      { categoria: CategoriaRecurso.PERSONAL, unidad: 'personas', cantidadTotal: 8 },
      { categoria: CategoriaRecurso.AGUA_POTABLE, unidad: 'litros', cantidadTotal: 10000 },
      { categoria: CategoriaRecurso.MEDICAMENTOS, unidad: 'unidades', cantidadTotal: 200 },
      { categoria: CategoriaRecurso.ALIMENTOS, unidad: 'raciones', cantidadTotal: 250 },
    ],
  },
  {
    // Suspendida: demuestra que la validacion no rechaza, degrada.
    codigoNacional: 'ONG-0004',
    nombre: 'Manos Unidas Punilla',
    tipo: TipoOrganizacion.ONG,
    cuit: '30700000006',
    estado: EstadoOrganizacion.SUSPENDIDA,
    email: 'contacto@manosunidaspunilla.org',
    certificaciones: [{ codigo: 'MANIP-ALI', nivel: 3, vence: VIGENTE }],
    recursos: [{ categoria: CategoriaRecurso.ALIMENTOS, unidad: 'raciones', cantidadTotal: 1000 }],
  },
];

/**
 * En desarrollo cada contrasena tiene un valor por defecto. En produccion
 * no: una cuenta de servicio con contrasena conocida seria una puerta
 * abierta, asi que si falta la variable la cuenta no se crea.
 */
function password(variable: string, porDefecto: string): string | null {
  const valor = process.env[variable];
  if (valor) return valor;
  if (esProduccion) {
    console.warn(`[seed] ${variable} no esta definida: se omite su cuenta`);
    return null;
  }
  return porDefecto;
}

async function upsertCuenta(
  email: string,
  plano: string | null,
  rol: RolCuenta,
  organizacionId: number | null = null,
): Promise<void> {
  if (!plano) return;

  const passwordHash = await bcrypt.hash(plano, SALT_ROUNDS);

  // La contrasena se actualiza en cada arranque: rotarla es cambiar la
  // variable de entorno y redesplegar.
  await prisma.cuenta.upsert({
    where: { email },
    create: { email, passwordHash, rol, organizacionId },
    update: { passwordHash },
  });
}

async function main(): Promise<void> {
  await upsertCuenta(
    'admin@sistemanacional.gob.ar',
    password('SEED_ADMIN_PASSWORD', 'Nacional2026!'),
    RolCuenta.ADMIN,
  );
  await upsertCuenta(
    'bonita@rescuesync.ar',
    password('SEED_BONITA_PASSWORD', 'Bonita2026!'),
    RolCuenta.SERVICIO,
  );
  await upsertCuenta(
    'app-web@rescuesync.ar',
    password('SEED_APP_WEB_PASSWORD', 'AppWeb2026!'),
    RolCuenta.SERVICIO,
  );

  for (const certificacion of certificaciones) {
    await prisma.certificacion.upsert({
      where: { codigo: certificacion.codigo },
      create: certificacion,
      update: { nombre: certificacion.nombre, categoria: certificacion.categoria },
    });
  }

  const passwordDemo = process.env.SEED_DEMO_PASSWORD || 'Rescue2026!';

  for (const demo of organizaciones) {
    const organizacion = await prisma.organizacion.upsert({
      where: { codigoNacional: demo.codigoNacional },
      create: {
        codigoNacional: demo.codigoNacional,
        nombre: demo.nombre,
        tipo: demo.tipo,
        cuit: demo.cuit,
        estado: demo.estado,
      },
      update: {},
    });

    await upsertCuenta(demo.email, passwordDemo, RolCuenta.ONG, organizacion.id);

    for (const otorgada of demo.certificaciones) {
      const certificacion = await prisma.certificacion.findUniqueOrThrow({
        where: { codigo: otorgada.codigo },
      });

      await prisma.organizacionCertificacion.upsert({
        where: {
          organizacionId_certificacionId: {
            organizacionId: organizacion.id,
            certificacionId: certificacion.id,
          },
        },
        create: {
          organizacionId: organizacion.id,
          certificacionId: certificacion.id,
          nivel: otorgada.nivel,
          fechaVencimiento: otorgada.vence,
        },
        update: {},
      });
    }

    for (const recurso of demo.recursos) {
      await prisma.recurso.upsert({
        where: {
          organizacionId_categoria: {
            organizacionId: organizacion.id,
            categoria: recurso.categoria,
          },
        },
        create: { organizacionId: organizacion.id, ...recurso },
        update: {},
      });
    }
  }

  console.log(
    `[seed] ${certificaciones.length} certificaciones, ${organizaciones.length} organizaciones de demostracion`,
  );
}

main()
  .catch((error) => {
    console.error('[seed] fallo', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
