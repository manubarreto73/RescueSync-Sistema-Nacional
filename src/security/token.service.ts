import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from './interfaces/jwt-payload.interface';

/**
 * Emision de access tokens.
 *
 * No hay refresh token: los clientes son sistemas que guardan sus
 * credenciales y, cuando el token vence, vuelven a llamar a /auth/login.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  generateAccessToken(payload: JwtPayload): Promise<string> {
    return this.jwtService.signAsync(payload);
  }

  /** Duracion del token en segundos, a partir del formato '15m', '1h', '7d'. */
  segundosDeVida(): number {
    const valor = this.config.get<string>('jwt.expiration', '1h');
    const match = /^(\d+)([smhd])?$/.exec(valor.trim());

    if (!match) return 3600;

    const cantidad = Number(match[1]);
    const factores: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

    return cantidad * (factores[match[2] ?? 's'] ?? 1);
  }
}
