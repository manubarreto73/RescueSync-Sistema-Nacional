import { CategoriaRecurso } from '@prisma/client';
import request from 'supertest';
import {
  EMAIL_ADMIN,
  EMAIL_ONG_1,
  EMAIL_SERVICIO,
  ONG_1,
  ORG_2,
  PASSWORD_TEST,
  resetearEstado,
} from './helpers/db';
import { BASE, TestContext, bearer, cerrarApp, crearAppDeTest, login } from './helpers/test-app';

describe('Organizaciones y recursos (e2e)', () => {
  let ctx: TestContext;
  let servicio: string;
  let admin: string;
  let ong1: string;

  beforeAll(async () => {
    ctx = await crearAppDeTest();
  });

  beforeEach(async () => {
    await resetearEstado(ctx.prisma);
    servicio = await login(ctx.app, EMAIL_SERVICIO, PASSWORD_TEST);
    admin = await login(ctx.app, EMAIL_ADMIN, PASSWORD_TEST);
    ong1 = await login(ctx.app, EMAIL_ONG_1, PASSWORD_TEST);
  });

  afterAll(() => cerrarApp(ctx));

  const http = () => request(ctx.app.getHttpServer());

  describe('GET /organizaciones', () => {
    it('filtra por estado', async () => {
      const res = await http()
        .get(`${BASE}/organizaciones?estado=HABILITADA`)
        .set('Authorization', bearer(servicio))
        .expect(200);

      expect(res.body.totalElements).toBe(2);
      expect(res.body.content.map((o: { codigoNacional: string }) => o.codigoNacional)).toEqual([
        ONG_1,
        ORG_2,
      ]);
    });

    it('el ADMIN tambien lista', async () => {
      await http().get(`${BASE}/organizaciones`).set('Authorization', bearer(admin)).expect(200);
    });
  });

  describe('GET /organizaciones/:codigo', () => {
    it('muestra solo las certificaciones vigentes', async () => {
      const res = await http()
        .get(`${BASE}/organizaciones/${ORG_2}`)
        .set('Authorization', bearer(servicio))
        .expect(200);

      expect(res.body.certificaciones).toEqual([
        {
          codigo: 'PRIM-AUX',
          nombre: 'Primeros auxilios',
          categoria: 'PERSONAL',
          nivel: 1,
          fechaVencimiento: '2099-12-31',
        },
      ]);
    });

    it('una ONG ve la propia y no la ajena', async () => {
      await http().get(`${BASE}/organizaciones/${ONG_1}`).set('Authorization', bearer(ong1)).expect(200);
      await http().get(`${BASE}/organizaciones/${ORG_2}`).set('Authorization', bearer(ong1)).expect(403);
    });

    it('una organizacion inexistente responde 404', async () => {
      await http()
        .get(`${BASE}/organizaciones/ONG-9999`)
        .set('Authorization', bearer(servicio))
        .expect(404);
    });
  });

  describe('/organizaciones/:codigo/recursos', () => {
    it('GET devuelve total, comprometido y disponible', async () => {
      await ctx.prisma.recurso.update({
        where: { organizacionId_categoria: { organizacionId: 1, categoria: CategoriaRecurso.PERSONAL } },
        data: { cantidadComprometida: 5 },
      });

      const res = await http()
        .get(`${BASE}/organizaciones/${ONG_1}/recursos`)
        .set('Authorization', bearer(ong1))
        .expect(200);

      expect(res.body.codigoNacional).toBe(ONG_1);
      expect(res.body.recursos).toContainEqual({
        categoria: 'PERSONAL',
        unidad: 'personas',
        cantidadTotal: 20,
        cantidadComprometida: 5,
        disponible: 15,
      });
    });

    it('PUT actualiza las categorias informadas y crea las nuevas', async () => {
      const res = await http()
        .put(`${BASE}/organizaciones/${ONG_1}/recursos`)
        .set('Authorization', bearer(ong1))
        .send({
          recursos: [
            { categoria: 'PERSONAL', unidad: 'personas', cantidadTotal: 25 },
            { categoria: 'AGUA_POTABLE', unidad: 'litros', cantidadTotal: 5000 },
          ],
        })
        .expect(200);

      const porCategoria = Object.fromEntries(
        res.body.recursos.map((r: { categoria: string; cantidadTotal: number }) => [
          r.categoria,
          r.cantidadTotal,
        ]),
      );

      // ALIMENTOS no vino en el request: queda como estaba.
      expect(porCategoria).toEqual({ PERSONAL: 25, ALIMENTOS: 1000, AGUA_POTABLE: 5000 });
    });

    it('PUT no permite bajar el total por debajo de lo comprometido', async () => {
      await ctx.prisma.recurso.update({
        where: { organizacionId_categoria: { organizacionId: 1, categoria: CategoriaRecurso.PERSONAL } },
        data: { cantidadComprometida: 8 },
      });

      const res = await http()
        .put(`${BASE}/organizaciones/${ONG_1}/recursos`)
        .set('Authorization', bearer(servicio))
        .send({ recursos: [{ categoria: 'PERSONAL', unidad: 'personas', cantidadTotal: 5 }] })
        .expect(409);

      expect(res.body.conflictos).toEqual([
        { categoria: 'PERSONAL', cantidadTotal: 5, cantidadComprometida: 8 },
      ]);
    });

    it('PUT rechaza categorias repetidas', async () => {
      await http()
        .put(`${BASE}/organizaciones/${ONG_1}/recursos`)
        .set('Authorization', bearer(servicio))
        .send({
          recursos: [
            { categoria: 'PERSONAL', unidad: 'personas', cantidadTotal: 5 },
            { categoria: 'PERSONAL', unidad: 'personas', cantidadTotal: 6 },
          ],
        })
        .expect(400);
    });

    it('una ONG no edita el inventario ajeno, y el ADMIN no edita inventarios', async () => {
      const body = { recursos: [{ categoria: 'PERSONAL', unidad: 'personas', cantidadTotal: 1 }] };

      await http()
        .put(`${BASE}/organizaciones/${ORG_2}/recursos`)
        .set('Authorization', bearer(ong1))
        .send(body)
        .expect(403);

      await http()
        .put(`${BASE}/organizaciones/${ORG_2}/recursos`)
        .set('Authorization', bearer(admin))
        .send(body)
        .expect(403);
    });
  });
});
