import { CategoriaRecurso } from '@prisma/client';
import request from 'supertest';
import {
  EMAIL_SERVICIO,
  ONG_1,
  ONG_SUSPENDIDA,
  ORG_2,
  PASSWORD_TEST,
  comprometido,
  resetearEstado,
} from './helpers/db';
import { BASE, TestContext, bearer, cerrarApp, crearAppDeTest, login } from './helpers/test-app';

describe('Proyectos: compromiso y cierre (e2e)', () => {
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

  const comprometer = (ref: string, body: object) =>
    http()
      .post(`${BASE}/proyectos/${ref}/compromisos`)
      .set('Authorization', bearer(servicio))
      .send(body);

  const cerrar = (ref: string) =>
    http().post(`${BASE}/proyectos/${ref}/cerrar`).set('Authorization', bearer(servicio));

  const adjudicacion = {
    gravedad: 'ALTA',
    compromisos: [
      {
        codigoNacional: ONG_1,
        items: [
          { categoria: 'PERSONAL', cantidad: 5 },
          { categoria: 'ALIMENTOS', cantidad: 600 },
        ],
      },
      { codigoNacional: ORG_2, items: [{ categoria: 'PERSONAL', cantidad: 2 }] },
    ],
  };

  describe('POST /proyectos/:ref/compromisos', () => {
    it('compromete los recursos y crea el proyecto', async () => {
      const res = await comprometer('20045', adjudicacion).expect(201);

      expect(res.body).toMatchObject({
        referencia: '20045',
        estado: 'EN_EJECUCION',
        gravedad: 'ALTA',
        fechaCierre: null,
      });
      expect(res.body.compromisos).toEqual([
        {
          id: 1,
          codigoNacional: ONG_1,
          estado: 'ACTIVO',
          items: [
            { categoria: 'PERSONAL', cantidad: 5 },
            { categoria: 'ALIMENTOS', cantidad: 600 },
          ],
        },
        { id: 2, codigoNacional: ORG_2, estado: 'ACTIVO', items: [{ categoria: 'PERSONAL', cantidad: 2 }] },
      ]);

      expect(await comprometido(ctx.prisma, 1, CategoriaRecurso.PERSONAL)).toBe(5);
      expect(await comprometido(ctx.prisma, 1, CategoriaRecurso.ALIMENTOS)).toBe(600);
      expect(await comprometido(ctx.prisma, 2, CategoriaRecurso.PERSONAL)).toBe(2);
    });

    it('es todo o nada: si un item no alcanza, no compromete ninguno', async () => {
      const res = await comprometer('20045', {
        gravedad: 'ALTA',
        compromisos: [
          { codigoNacional: ONG_1, items: [{ categoria: 'PERSONAL', cantidad: 5 }] },
          {
            codigoNacional: ORG_2,
            items: [
              { categoria: 'PERSONAL', cantidad: 4 },
              { categoria: 'AGUA_POTABLE', cantidad: 10 },
            ],
          },
        ],
      }).expect(409);

      expect(res.body.message).toBe('Recursos insuficientes para comprometer el proyecto 20045');
      expect(res.body.faltantes).toEqual([
        { codigoNacional: ORG_2, categoria: 'PERSONAL', pedido: 4, disponible: 3 },
        { codigoNacional: ORG_2, categoria: 'AGUA_POTABLE', pedido: 10, disponible: 0 },
      ]);

      expect(await comprometido(ctx.prisma, 1, CategoriaRecurso.PERSONAL)).toBe(0);
      expect(await ctx.prisma.compromiso.count()).toBe(0);
      // El rollback tambien deshace el alta del proyecto.
      expect(await ctx.prisma.proyecto.count()).toBe(0);
    });

    it('un reintento identico no compromete dos veces', async () => {
      await comprometer('20045', adjudicacion).expect(201);
      const reintento = await comprometer('20045', adjudicacion).expect(201);

      expect(reintento.body.compromisos).toHaveLength(2);
      expect(await comprometido(ctx.prisma, 1, CategoriaRecurso.PERSONAL)).toBe(5);
      expect(await ctx.prisma.compromiso.count()).toBe(2);
    });

    it('si solo algunas ONGs ya estaban comprometidas responde 409', async () => {
      await comprometer('20045', {
        gravedad: 'ALTA',
        compromisos: [{ codigoNacional: ONG_1, items: [{ categoria: 'PERSONAL', cantidad: 1 }] }],
      }).expect(201);

      const res = await comprometer('20045', adjudicacion).expect(409);
      expect(res.body.organizaciones).toEqual([ONG_1]);
    });

    it('no compromete recursos de una organizacion suspendida', async () => {
      const res = await comprometer('20045', {
        gravedad: 'BAJA',
        compromisos: [{ codigoNacional: ONG_SUSPENDIDA, items: [{ categoria: 'ALIMENTOS', cantidad: 1 }] }],
      }).expect(409);

      expect(res.body.organizaciones).toEqual([{ codigoNacional: ONG_SUSPENDIDA, estado: 'SUSPENDIDA' }]);
    });

    it('una organizacion inexistente responde 404', async () => {
      await comprometer('20045', {
        gravedad: 'BAJA',
        compromisos: [{ codigoNacional: 'ONG-9999', items: [{ categoria: 'PERSONAL', cantidad: 1 }] }],
      }).expect(404);
    });

    it('una organizacion repetida responde 400', async () => {
      await comprometer('20045', {
        gravedad: 'BAJA',
        compromisos: [
          { codigoNacional: ONG_1, items: [{ categoria: 'PERSONAL', cantidad: 1 }] },
          { codigoNacional: ONG_1, items: [{ categoria: 'ALIMENTOS', cantidad: 1 }] },
        ],
      }).expect(400);
    });
  });

  describe('POST /proyectos/:ref/cerrar', () => {
    it('libera todos los recursos y finaliza el proyecto', async () => {
      await comprometer('20045', adjudicacion).expect(201);

      const res = await cerrar('20045').expect(200);

      expect(res.body).toMatchObject({ referencia: '20045', estado: 'FINALIZADO' });
      expect(res.body.liberados).toEqual([
        {
          codigoNacional: ONG_1,
          items: [
            { categoria: 'PERSONAL', cantidad: 5 },
            { categoria: 'ALIMENTOS', cantidad: 600 },
          ],
        },
        { codigoNacional: ORG_2, items: [{ categoria: 'PERSONAL', cantidad: 2 }] },
      ]);

      expect(await comprometido(ctx.prisma, 1, CategoriaRecurso.PERSONAL)).toBe(0);
      expect(await comprometido(ctx.prisma, 1, CategoriaRecurso.ALIMENTOS)).toBe(0);
      expect(await comprometido(ctx.prisma, 2, CategoriaRecurso.PERSONAL)).toBe(0);
      expect(await ctx.prisma.compromiso.count({ where: { estado: 'LIBERADO' } })).toBe(2);
    });

    it('solo libera lo de su proyecto', async () => {
      await comprometer('A', {
        gravedad: 'BAJA',
        compromisos: [{ codigoNacional: ONG_1, items: [{ categoria: 'PERSONAL', cantidad: 4 }] }],
      }).expect(201);
      await comprometer('B', {
        gravedad: 'BAJA',
        compromisos: [{ codigoNacional: ONG_1, items: [{ categoria: 'PERSONAL', cantidad: 6 }] }],
      }).expect(201);

      await cerrar('A').expect(200);

      expect(await comprometido(ctx.prisma, 1, CategoriaRecurso.PERSONAL)).toBe(6);
    });

    it('cerrar dos veces es idempotente', async () => {
      await comprometer('20045', adjudicacion).expect(201);
      await cerrar('20045').expect(200);

      const res = await cerrar('20045').expect(200);

      expect(res.body).toMatchObject({ estado: 'FINALIZADO', liberados: [] });
      expect(await comprometido(ctx.prisma, 1, CategoriaRecurso.PERSONAL)).toBe(0);
    });

    it('no se comprometen recursos en un proyecto finalizado', async () => {
      await comprometer('20045', adjudicacion).expect(201);
      await cerrar('20045').expect(200);

      const res = await comprometer('20045', {
        gravedad: 'ALTA',
        compromisos: [{ codigoNacional: ORG_2, items: [{ categoria: 'PERSONAL', cantidad: 1 }] }],
      }).expect(409);

      expect(res.body.message).toBe('El proyecto 20045 ya fue finalizado');
    });

    it('un proyecto inexistente responde 404', async () => {
      await cerrar('no-existe').expect(404);
    });
  });

  describe('concurrencia', () => {
    /**
     * El test que justifica el locking. ORG-0002 tiene 3 personas. Diez
     * adjudicaciones de diez emergencias distintas piden 1 persona cada una
     * al mismo tiempo: exactamente 3 tienen que entrar y 7 que rebotar.
     *
     * Sin el SELECT ... FOR UPDATE, varias transacciones leerian "hay 3
     * disponibles" antes de que alguna escriba y comprometerian de mas.
     */
    it('diez compromisos simultaneos sobre un recurso con stock para tres', async () => {
      const respuestas = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          comprometer(`emergencia-${i}`, {
            gravedad: 'BAJA',
            compromisos: [{ codigoNacional: ORG_2, items: [{ categoria: 'PERSONAL', cantidad: 1 }] }],
          }),
        ),
      );

      const estados = respuestas.map((r) => r.status);

      expect(estados.filter((s) => s === 201)).toHaveLength(3);
      expect(estados.filter((s) => s === 409)).toHaveLength(7);
      expect(await comprometido(ctx.prisma, 2, CategoriaRecurso.PERSONAL)).toBe(3);
      expect(await ctx.prisma.compromiso.count()).toBe(3);
    });

    it('cierres y compromisos simultaneos sobre el mismo recurso no se pisan', async () => {
      await comprometer('previo', {
        gravedad: 'BAJA',
        compromisos: [{ codigoNacional: ORG_2, items: [{ categoria: 'PERSONAL', cantidad: 3 }] }],
      }).expect(201);

      // El cierre libera 3 mientras otros cinco intentan tomar 1 cada uno.
      const [cierre, ...compromisos] = await Promise.all([
        cerrar('previo'),
        ...Array.from({ length: 5 }, (_, i) =>
          comprometer(`nueva-${i}`, {
            gravedad: 'BAJA',
            compromisos: [{ codigoNacional: ORG_2, items: [{ categoria: 'PERSONAL', cantidad: 1 }] }],
          }),
        ),
      ]);

      expect(cierre.status).toBe(200);

      const aceptados = compromisos.filter((r) => r.status === 201).length;
      expect(aceptados).toBeLessThanOrEqual(3);
      expect(await comprometido(ctx.prisma, 2, CategoriaRecurso.PERSONAL)).toBe(aceptados);
    });
  });
});
