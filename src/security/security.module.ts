import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { SignOptions } from 'jsonwebtoken';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { PasswordService } from './password.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokenService } from './token.service';

/**
 * Cadena de seguridad: la estrategia que valida el token, los dos guards
 * globales (autenticacion primero, roles despues) y los servicios de hashing
 * y emision de tokens.
 */
@Global()
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('jwt.secret'),
        signOptions: {
          algorithm: 'HS256',
          expiresIn: config.get<string>('jwt.expiration', '1h') as SignOptions['expiresIn'],
        },
      }),
    }),
  ],
  providers: [
    JwtStrategy,
    TokenService,
    PasswordService,
    // El orden importa: Nest ejecuta los guards globales en el orden de registro.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [TokenService, PasswordService],
})
export class SecurityModule {}
