import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../../common/decorators';

/**
 * Guard global de autenticacion: todo endpoint exige token salvo los
 * marcados con @Public().
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    return super.canActivate(context);
  }

  /** Un unico mensaje para token ausente, mal firmado o vencido. */
  handleRequest<T>(err: unknown, user: T): T {
    if (err || !user) {
      throw new UnauthorizedException('Token ausente, invalido o vencido');
    }
    return user;
  }
}
