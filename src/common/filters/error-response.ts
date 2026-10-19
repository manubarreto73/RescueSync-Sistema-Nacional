/**
 * Forma unica de todos los errores que devuelve la API.
 *
 * Algunos errores agregan detalle propio (por ejemplo `faltantes` en el 409
 * de compromisos): se suma como propiedades extra junto a las cuatro fijas.
 */
export interface ErrorResponse {
  status: number;
  message: string | string[];
  path: string;
  timestamp: string;
  [detalle: string]: unknown;
}
