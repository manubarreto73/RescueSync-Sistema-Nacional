import request from 'supertest';
import { resetearEstado } from './helpers/db';
import { BASE, TestContext, bearer, cerrarApp, crearAppDeTest, login } from './helpers/test-app';

describe('Onboarding (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await crearAppDeTest();
  });

  beforeEach(() => resetearEstado(ctx.prisma));

  afterAll(() => cerrarApp(ctx));

  const http = () => request(ctx.app.getHttpServer());

  const alta = {
    nombre: 'Bomberos Voluntarios de Berisso',
    cuit: '30-71234567-8',
    email: 'Contacto@BVBerisso.org',
    password: 'Berisso2026!',
  };

  it('registra la ONG habilitada, con codigo nacional y cuenta de acceso', async () => {
    const res = await http().post(`${BASE}/onboarding/ong`).send(alta).expect(201);

    // Hay 3 organizaciones sembradas: el id siguiente es el 4.
    expect(res.body).toEqual({
      codigoNacional: 'ONG-0004',
      nombre: alta.nombre,
      tipo: 'ONG',
      estado: 'HABILITADA',
      email: 'contacto@bvberisso.org',
    });

    // La cuenta creada inicia sesion y ve su propia organizacion.
    const token = await login(ctx.app, 'contacto@bvberisso.org', alta.password);
    const detalle = await http()
      .get(`${BASE}/organizaciones/ONG-0004`)
      .set('Authorization', bearer(token))
      .expect(200);

    expect(detalle.body.cuit).toBe('30712345678');
  });

  it('un organismo de rescate recibe el prefijo ORG', async () => {
    const res = await http()
      .post(`${BASE}/onboarding/ong`)
      .send({ ...alta, tipo: 'ORGANISMO_RESCATE' })
      .expect(201);

    expect(res.body.codigoNacional).toBe('ORG-0004');
  });

  it.each([
    ['nombre', { nombre: 'cruz solidaria' }],
    ['CUIT', { cuit: '30111111111' }],
    ['email', { email: 'ong1@test.ar' }],
  ])('un %s ya registrado responde 409', async (_campo, cambio) => {
    await http()
      .post(`${BASE}/onboarding/ong`)
      .send({ ...alta, ...cambio })
      .expect(409);

    expect(await ctx.prisma.organizacion.count()).toBe(3);
  });

  it('un CUIT mal formado responde 400', async () => {
    await http()
      .post(`${BASE}/onboarding/ong`)
      .send({ ...alta, cuit: '123' })
      .expect(400);
  });
});
