import request from 'supertest';
import {
  EMAIL_ONG_1,
  EMAIL_SERVICIO,
  ONG_1,
  ONG_SUSPENDIDA,
  ORG_2,
  PASSWORD_TEST,
  resetearEstado,
} from './helpers/db';
import { BASE, TestContext, bearer, cerrarApp, crearAppDeTest, login } from './helpers/test-app';

describe('Validaciones (e2e)', () => {
  let ctx: TestContext;
  let servicio: string;

  beforeAll(async () => {
    ctx = await crearAppDeTest();
  });

  beforeEach(async () => {
    await resetearEstado(ctx.prisma);
    servicio = await login(ctx.app, EMAIL_SERVICIO, PASSWORD_TEST);
  });

  afterAll(() => cerrarApp(ctx));

  const http = () => request(ctx.app.getHttpServer());

  it('evalua cada linea sin rechazar ninguna', async () => {
    const res = await http()
      .post(`${BASE}/validaciones`)
      .set('Authorization', bearer(servicio))
      .send({
        gravedad: 'ALTA',
        lineas: [
          { lineaId: 1, codigoNacional: ONG_1, categoria: 'PERSONAL', cantidad: 5 },
          { lineaId: 2, codigoNacional: ORG_2, categoria: 'PERSONAL', cantidad: 2 },
          { lineaId: 3, codigoNacional: ORG_2, categoria: 'ALIMENTOS', cantidad: 10 },
          { lineaId: 4, codigoNacional: ONG_SUSPENDIDA, categoria: 'ALIMENTOS', cantidad: 10 },
          { lineaId: 5, codigoNacional: 'ONG-9999', categoria: 'PERSONAL', cantidad: 1 },
        ],
      })
      .expect(200);

    const [principal, nivelBajo, vencida, suspendida, inexistente] = res.body.resultados;

    expect(principal).toEqual({
      lineaId: 1,
      caracter: 'PRINCIPAL',
      perfilCompetencia: 'Primeros auxilios nivel 3 - habilitada hasta gravedad ALTA',
      capacidadesHabilitadas: ['PERSONAL'],
      nivelRiesgoPermitido: 'ALTA',
      disponible: true,
      cantidadDisponible: 20,
    });

    expect(nivelBajo).toMatchObject({
      lineaId: 2,
      caracter: 'APOYO_SECUNDARIO',
      nivelRiesgoPermitido: 'BAJA',
      perfilCompetencia: 'Primeros auxilios nivel 1 - habilitada hasta gravedad BAJA (la emergencia es ALTA)',
    });

    expect(vencida).toMatchObject({ lineaId: 3, caracter: 'APOYO_SECUNDARIO', disponible: false });
    expect(vencida.perfilCompetencia).toContain('vencida el 2020-01-31');

    expect(suspendida).toMatchObject({ lineaId: 4, caracter: 'APOYO_SECUNDARIO' });
    expect(suspendida.perfilCompetencia).toContain('SUSPENDIDA');

    expect(inexistente).toMatchObject({ lineaId: 5, caracter: 'APOYO_SECUNDARIO' });
  });

  it('validar no compromete nada', async () => {
    await http()
      .post(`${BASE}/validaciones`)
      .set('Authorization', bearer(servicio))
      .send({
        gravedad: 'BAJA',
        lineas: [{ lineaId: 1, codigoNacional: ONG_1, categoria: 'PERSONAL', cantidad: 5 }],
      })
      .expect(200);

    const comprometido = await ctx.prisma.recurso.aggregate({ _sum: { cantidadComprometida: true } });
    expect(comprometido._sum.cantidadComprometida).toBe(0);
  });

  it('solo la puede invocar una cuenta de servicio', async () => {
    const ong = await login(ctx.app, EMAIL_ONG_1, PASSWORD_TEST);

    await http()
      .post(`${BASE}/validaciones`)
      .set('Authorization', bearer(ong))
      .send({
        gravedad: 'BAJA',
        lineas: [{ lineaId: 1, codigoNacional: ONG_1, categoria: 'PERSONAL', cantidad: 1 }],
      })
      .expect(403);
  });

  it('rechaza una gravedad desconocida', async () => {
    await http()
      .post(`${BASE}/validaciones`)
      .set('Authorization', bearer(servicio))
      .send({
        gravedad: 'EXTREMA',
        lineas: [{ lineaId: 1, codigoNacional: ONG_1, categoria: 'PERSONAL', cantidad: 1 }],
      })
      .expect(400);
  });
});
