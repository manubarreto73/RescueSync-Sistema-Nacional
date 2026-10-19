import { ForbiddenException } from '@nestjs/common';
import { RolCuenta } from '@prisma/client';
import { CuentaAutenticada } from './interfaces/jwt-payload.interface';

/**
 * Una cuenta ONG solo opera sobre su propia organizacion. Los demas roles
 * que hayan pasado el @Roles del endpoint operan sobre cualquiera.
 *
 * Es 403 y no 404 a proposito: la organizacion existe, lo que falta es el permiso.
 */
export function asegurarAccesoAOrganizacion(cuenta: CuentaAutenticada, codigo: string): void {
  if (cuenta.rol === RolCuenta.ONG && cuenta.codigoNacional !== codigo) {
    throw new ForbiddenException('Solo puede operar sobre su propia organizacion');
  }
}
