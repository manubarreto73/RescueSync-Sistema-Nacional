import { CategoriaRecurso, EstadoOrganizacion, NivelGravedad } from '@prisma/client';
import {
  LineaAEvaluar,
  OrganizacionAEvaluar,
  evaluarLinea,
  gravedadHabilitada,
} from './reglas-competencia';

const HOY = new Date('2026-10-22T00:00:00Z');

const linea: LineaAEvaluar = {
  lineaId: 41,
  codigoNacional: 'ONG-0001',
  categoria: CategoriaRecurso.PERSONAL,
  cantidad: 5,
};

function organizacion(cambios: Partial<OrganizacionAEvaluar> = {}): OrganizacionAEvaluar {
  return {
    estado: EstadoOrganizacion.HABILITADA,
    certificaciones: [
      {
        nombre: 'Rescate acuatico',
        categoria: CategoriaRecurso.PERSONAL,
        nivel: 3,
        fechaVencimiento: new Date('2027-06-30T00:00:00Z'),
      },
    ],
    recursos: [
      { categoria: CategoriaRecurso.PERSONAL, cantidadTotal: 20, cantidadComprometida: 5 },
    ],
    ...cambios,
  };
}

describe('evaluarLinea', () => {
  it('es PRINCIPAL cuando el nivel alcanza la gravedad', () => {
    const resultado = evaluarLinea(linea, NivelGravedad.ALTA, organizacion(), HOY);

    expect(resultado.caracter).toBe('PRINCIPAL');
    expect(resultado.nivelRiesgoPermitido).toBe(NivelGravedad.ALTA);
    expect(resultado.capacidadesHabilitadas).toEqual([CategoriaRecurso.PERSONAL]);
    expect(resultado.perfilCompetencia).toBe(
      'Rescate acuatico nivel 3 - habilitada hasta gravedad ALTA',
    );
  });

  it('baja a APOYO_SECUNDARIO con nivel insuficiente, sin rechazar', () => {
    const resultado = evaluarLinea(linea, NivelGravedad.CRITICA, organizacion(), HOY);

    expect(resultado.caracter).toBe('APOYO_SECUNDARIO');
    expect(resultado.perfilCompetencia).toContain('(la emergencia es CRITICA)');
    expect(resultado.nivelRiesgoPermitido).toBe(NivelGravedad.ALTA);
  });

  it('usa la mejor certificacion vigente de la categoria', () => {
    const org = organizacion({
      certificaciones: [
        {
          nombre: 'Primeros auxilios',
          categoria: CategoriaRecurso.PERSONAL,
          nivel: 1,
          fechaVencimiento: new Date('2027-01-01T00:00:00Z'),
        },
        {
          nombre: 'Rescate urbano',
          categoria: CategoriaRecurso.PERSONAL,
          nivel: 4,
          fechaVencimiento: new Date('2027-01-01T00:00:00Z'),
        },
      ],
    });

    const resultado = evaluarLinea(linea, NivelGravedad.CRITICA, org, HOY);

    expect(resultado.caracter).toBe('PRINCIPAL');
    expect(resultado.perfilCompetencia).toContain('Rescate urbano nivel 4');
  });

  it('ignora certificaciones vencidas y lo explica', () => {
    const org = organizacion({
      certificaciones: [
        {
          nombre: 'Rescate acuatico',
          categoria: CategoriaRecurso.PERSONAL,
          nivel: 4,
          fechaVencimiento: new Date('2026-01-31T00:00:00Z'),
        },
      ],
    });

    const resultado = evaluarLinea(linea, NivelGravedad.BAJA, org, HOY);

    expect(resultado.caracter).toBe('APOYO_SECUNDARIO');
    expect(resultado.perfilCompetencia).toBe(
      'Rescate acuatico vencida el 2026-01-31: sin habilitacion vigente para PERSONAL',
    );
    expect(resultado.capacidadesHabilitadas).toEqual([]);
    expect(resultado.nivelRiesgoPermitido).toBeNull();
  });

  it('una certificacion que vence hoy sigue vigente', () => {
    const org = organizacion({
      certificaciones: [
        {
          nombre: 'Rescate acuatico',
          categoria: CategoriaRecurso.PERSONAL,
          nivel: 2,
          fechaVencimiento: HOY,
        },
      ],
    });

    expect(evaluarLinea(linea, NivelGravedad.MEDIA, org, HOY).caracter).toBe('PRINCIPAL');
  });

  it('sin certificacion de la categoria es APOYO_SECUNDARIO', () => {
    const resultado = evaluarLinea(
      { ...linea, categoria: CategoriaRecurso.MEDICAMENTOS },
      NivelGravedad.BAJA,
      organizacion(),
      HOY,
    );

    expect(resultado.caracter).toBe('APOYO_SECUNDARIO');
    expect(resultado.perfilCompetencia).toBe('Sin certificacion vigente para MEDICAMENTOS');
  });

  it('una organizacion suspendida solo puede ser apoyo secundario', () => {
    const resultado = evaluarLinea(
      linea,
      NivelGravedad.BAJA,
      organizacion({ estado: EstadoOrganizacion.SUSPENDIDA }),
      HOY,
    );

    expect(resultado.caracter).toBe('APOYO_SECUNDARIO');
    expect(resultado.perfilCompetencia).toContain('SUSPENDIDA');
  });

  it('una organizacion inexistente no rompe la validacion', () => {
    const resultado = evaluarLinea(linea, NivelGravedad.BAJA, null, HOY);

    expect(resultado.caracter).toBe('APOYO_SECUNDARIO');
    expect(resultado.disponible).toBe(false);
  });

  it('informa la disponibilidad sin que afecte el caracter', () => {
    const resultado = evaluarLinea(
      { ...linea, cantidad: 16 },
      NivelGravedad.ALTA,
      organizacion(),
      HOY,
    );

    expect(resultado.caracter).toBe('PRINCIPAL');
    expect(resultado.disponible).toBe(false);
    expect(resultado.cantidadDisponible).toBe(15);
  });
});

describe('gravedadHabilitada', () => {
  it.each([
    [1, NivelGravedad.BAJA],
    [2, NivelGravedad.MEDIA],
    [3, NivelGravedad.ALTA],
    [4, NivelGravedad.CRITICA],
  ])('nivel %i habilita hasta %s', (nivel, gravedad) => {
    expect(gravedadHabilitada(nivel)).toBe(gravedad);
  });
});
