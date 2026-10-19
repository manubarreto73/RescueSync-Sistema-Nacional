import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { CuentaAutenticada, JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * Passport extrae el token del header Authorization, valida firma y
 * expiracion, y recien entonces llama a validate(). Lo que devuelve queda en
 * request.user.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('jwt.secret'),
      algorithms: ['HS256'],
    });
  }

  validate(payload: JwtPayload): CuentaAutenticada {
    return {
      id: payload.sub,
      email: payload.email,
      rol: payload.rol,
      codigoNacional: payload.codigoNacional ?? null,
    };
  }
}
