import request from 'supertest';
import {
  EMAIL_INACTIVA,
  EMAIL_ONG_1,
  EMAIL_SERVICIO,
  PASSWORD_TEST,
  resetearEstado,
} from './helpers/db';
import { BASE, TestContext, bearer, cerrarApp, crearAppDeTest, login } from './helpers/test-app';

describe('Auth (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await crearAppDeTest();
  });

  beforeEach(() => resetearEstado(ctx.prisma));

  afterAll(() => cerrarApp(ctx));

  const http = () => request(ctx.app.getHttpServer());

  it('login devuelve un JWT con su vigencia', async () => {
    const res = await http()
      .post(`${BASE}/auth/login`)
      .send({ email: EMAIL_SERVICIO, password: PASSWORD_TEST })
      .expect(200);

    expect(res.body).toEqual({
      accessToken: expect.any(String),
      tokenType: 'Bearer',
      expiresIn: 3600,
    });

    const payload = JSON.parse(
      Buffer.from(res.body.accessToken.split('.')[1], 'base64url').toString(),
    );
    expect(payload).toMatchObject({ email: EMAIL_SERVICIO, rol: 'SERVICIO', codigoNacional: null });
  });

  it('el token de una ONG lleva su codigo nacional', async () => {
    const token = await login(ctx.app, EMAIL_ONG_1, PASSWORD_TEST);
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());

    expect(payload.codigoNacional).toBe('ONG-0001');
  });

  it.each([
    ['contrasena incorrecta', EMAIL_SERVICIO, 'Incorrecta123'],
    ['email inexistente', 'nadie@test.ar', PASSWORD_TEST],
    ['cuenta inactiva', EMAIL_INACTIVA, PASSWORD_TEST],
  ])('%s responde 401 con el mismo mensaje', async (_caso, email, password) => {
    const res = await http().post(`${BASE}/auth/login`).send({ email, password }).expect(401);

    expect(res.body.message).toBe('Credenciales invalidas');
  });

  it('un body invalido responde 400', async () => {
    await http().post(`${BASE}/auth/login`).send({ email: 'no-es-email' }).expect(400);
  });

  it('un endpoint protegido sin token responde 401', async () => {
    await http().get(`${BASE}/organizaciones`).expect(401);
  });

  it('un token adulterado responde 401', async () => {
    const token = await login(ctx.app, EMAIL_SERVICIO, PASSWORD_TEST);
    const adulterado = token.slice(0, -4) + 'AAAA';

    await http().get(`${BASE}/organizaciones`).set('Authorization', bearer(adulterado)).expect(401);
  });

  it('un rol sin permiso responde 403', async () => {
    const token = await login(ctx.app, EMAIL_ONG_1, PASSWORD_TEST);

    await http().get(`${BASE}/organizaciones`).set('Authorization', bearer(token)).expect(403);
  });

  it('el healthcheck es publico', async () => {
    const res = await http().get(`${BASE}/health`).expect(200);
    expect(res.body.status).toBe('ok');
  });
});
