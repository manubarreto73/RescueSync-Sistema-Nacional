import { CategoriaRecurso, EstadoOrganizacion, NivelGravedad } from '@prisma/client';

/**
 * Reglas de la validacion por niveles de competencia.
 *
 * Funciones puras, sin base ni Nest: son el corazon del requisito 3 de la
 * consigna y se prueban de forma aislada (reglas-competencia.spec.ts).
 *
 * La consigna pide explicitamente evitar el rechazo punitivo o binario: por
 * eso no existe un resultado "rechazada". Toda linea vuelve con un caracter,
 * PRINCIPAL o APOYO_SECUNDARIO, y con el motivo.
 */

export type Caracter = 'PRINCIPAL' | 'APOYO_SECUNDARIO';

/** Nivel de certificacion que exige cada gravedad para actuar como lote principal. */
export const NIVEL_REQUERIDO: Record<NivelGravedad, number> = {
  [NivelGravedad.BAJA]: 1,
  [NivelGravedad.MEDIA]: 2,
  [NivelGravedad.ALTA]: 3,
  [NivelGravedad.CRITICA]: 4,
};

const GRAVEDAD_POR_NIVEL: NivelGravedad[] = [
  NivelGravedad.BAJA,
  NivelGravedad.MEDIA,
  NivelGravedad.ALTA,
  NivelGravedad.CRITICA,
];

/** Hasta que gravedad habilita un nivel de certificacion. */
export function gravedadHabilitada(nivel: number): NivelGravedad {
  const indice = Math.min(Math.max(nivel, 1), GRAVEDAD_POR_NIVEL.length) - 1;
  return GRAVEDAD_POR_NIVEL[indice];
}

export interface LineaAEvaluar {
  lineaId: number;
  codigoNacional: string;
  categoria: CategoriaRecurso;
  cantidad: number;
}

export interface OrganizacionAEvaluar {
  estado: EstadoOrganizacion;
  certificaciones: {
    nombre: string;
    categoria: CategoriaRecurso;
    nivel: number;
    fechaVencimiento: Date;
  }[];
  recursos: {
    categoria: CategoriaRecurso;
    cantidadTotal: number;
    cantidadComprometida: number;
  }[];
}

export interface ResultadoLinea {
  lineaId: number;
  caracter: Caracter;
  perfilCompetencia: string;
  capacidadesHabilitadas: CategoriaRecurso[];
  nivelRiesgoPermitido: NivelGravedad | null;
  disponible: boolean;
  cantidadDisponible: number;
}

/** La aplicacion web acepta hasta 200 caracteres en perfilCompetencia. */
const LARGO_MAXIMO_PERFIL = 200;

export function evaluarLinea(
  linea: LineaAEvaluar,
  gravedad: NivelGravedad,
  organizacion: OrganizacionAEvaluar | null,
  hoy: Date,
): ResultadoLinea {
  if (!organizacion) {
    return {
      lineaId: linea.lineaId,
      caracter: 'APOYO_SECUNDARIO',
      perfilCompetencia: `${linea.codigoNacional} no esta registrada en el Sistema Nacional`,
      capacidadesHabilitadas: [],
      nivelRiesgoPermitido: null,
      disponible: false,
      cantidadDisponible: 0,
    };
  }

  const vigentes = organizacion.certificaciones.filter((c) => c.fechaVencimiento >= hoy);
  const capacidadesHabilitadas = [...new Set(vigentes.map((c) => c.categoria))].sort();

  // La mejor certificacion vigente de la categoria decide el nivel.
  const mejor = vigentes
    .filter((c) => c.categoria === linea.categoria)
    .sort((a, b) => b.nivel - a.nivel)[0];

  const recurso = organizacion.recursos.find((r) => r.categoria === linea.categoria);
  const cantidadDisponible = recurso ? recurso.cantidadTotal - recurso.cantidadComprometida : 0;

  const base = {
    lineaId: linea.lineaId,
    capacidadesHabilitadas,
    nivelRiesgoPermitido: mejor ? gravedadHabilitada(mejor.nivel) : null,
    // Informativo: el bloqueo real ocurre al comprometer, no al validar.
    disponible: cantidadDisponible >= linea.cantidad,
    cantidadDisponible,
  };

  if (organizacion.estado !== EstadoOrganizacion.HABILITADA) {
    return {
      ...base,
      caracter: 'APOYO_SECUNDARIO',
      perfilCompetencia: recortar(
        `Organizacion ${organizacion.estado}: solo puede actuar como apoyo secundario`,
      ),
    };
  }

  if (!mejor) {
    const vencida = organizacion.certificaciones
      .filter((c) => c.categoria === linea.categoria && c.fechaVencimiento < hoy)
      .sort((a, b) => b.fechaVencimiento.getTime() - a.fechaVencimiento.getTime())[0];

    return {
      ...base,
      caracter: 'APOYO_SECUNDARIO',
      perfilCompetencia: recortar(
        vencida
          ? `${vencida.nombre} vencida el ${fecha(vencida.fechaVencimiento)}: sin habilitacion vigente para ${linea.categoria}`
          : `Sin certificacion vigente para ${linea.categoria}`,
      ),
    };
  }

  const habilitadaHasta = gravedadHabilitada(mejor.nivel);
  const descripcion = `${mejor.nombre} nivel ${mejor.nivel} - habilitada hasta gravedad ${habilitadaHasta}`;

  if (mejor.nivel >= NIVEL_REQUERIDO[gravedad]) {
    return { ...base, caracter: 'PRINCIPAL', perfilCompetencia: recortar(descripcion) };
  }

  return {
    ...base,
    caracter: 'APOYO_SECUNDARIO',
    perfilCompetencia: recortar(`${descripcion} (la emergencia es ${gravedad})`),
  };
}

function fecha(valor: Date): string {
  return valor.toISOString().slice(0, 10);
}

function recortar(texto: string): string {
  return texto.length > LARGO_MAXIMO_PERFIL ? texto.slice(0, LARGO_MAXIMO_PERFIL) : texto;
}
