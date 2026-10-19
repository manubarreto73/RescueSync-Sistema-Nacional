import { RolCuenta } from '@prisma/client';

/**
 * Claims del access token. Lo minimo para autorizar sin ir a la base, y nada
 * sensible: el JWT esta firmado, no cifrado.
 *
 * codigoNacional viaja para que una cuenta ONG pueda operar sobre su propia
 * organizacion sin una consulta extra. Es null para ADMIN y SERVICIO.
 */
export interface JwtPayload {
  /** subject: id de la cuenta */
  sub: number;
  email: string;
  rol: RolCuenta;
  codigoNacional: string | null;
  iat?: number;
  exp?: number;
}

/** Lo que queda en request.user una vez validado el token. */
export interface CuentaAutenticada {
  id: number;
  email: string;
  rol: RolCuenta;
  codigoNacional: string | null;
}
