import { ExecutionContext, SetMetadata, createParamDecorator } from '@nestjs/common';
import { RolCuenta } from '@prisma/client';
import { CuentaAutenticada } from '../../security/interfaces/jwt-payload.interface';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';

/** Endpoint accesible sin token. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Restringe un endpoint a ciertos roles. Sin @Roles basta con estar autenticado. */
export const Roles = (...roles: RolCuenta[]) => SetMetadata(ROLES_KEY, roles);

/** Inyecta la cuenta autenticada en el metodo del controller. */
export const CuentaActual = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CuentaAutenticada => {
    return ctx.switchToHttp().getRequest<{ user: CuentaAutenticada }>().user;
  },
);
