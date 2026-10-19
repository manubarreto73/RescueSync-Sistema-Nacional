import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolCuenta } from '@prisma/client';
import { ROLES_KEY } from '../../common/decorators';
import { CuentaAutenticada } from '../interfaces/jwt-payload.interface';

/**
 * Guard global de autorizacion. Corre despues de JwtAuthGuard. Si el
 * endpoint no declara @Roles(...), no restringe nada.
 *
 * A diferencia del ADMIN de desarrollo de la aplicacion web, el ADMIN de aca
 * no saltea los roles: es un perfil real con permisos propios.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requeridos = this.reflector.getAllAndOverride<RolCuenta[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requeridos || requeridos.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<{ user?: CuentaAutenticada }>();

    if (!user || !requeridos.includes(user.rol)) {
      throw new ForbiddenException('No tiene permisos para realizar esta operacion');
    }

    return true;
  }
}
