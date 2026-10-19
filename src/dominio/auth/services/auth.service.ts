import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PasswordService } from '../../../security/password.service';
import { TokenService } from '../../../security/token.service';
import { AuthResponseDto } from '../dtos/auth-response.dto';
import { LoginDto } from '../dtos/login.dto';

/**
 * Hash bcrypt de un valor cualquiera. Cuando el email no existe se compara
 * contra este hash igual: sin eso, la respuesta llegaria notablemente mas
 * rapido y se podria averiguar por tiempos que emails tienen cuenta.
 */
const HASH_SENUELO = '$2a$10$3hkooMT0KAKVrWbFSQolaO6EwkwSagPK0L81dyEyGfxRDDGFlAMz6';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
  ) {}

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const cuenta = await this.prisma.cuenta.findUnique({
      where: { email: dto.email },
      include: { organizacion: { select: { codigoNacional: true } } },
    });

    const passwordValida = await this.passwordService.compare(
      dto.password,
      cuenta?.passwordHash ?? HASH_SENUELO,
    );

    // Un unico mensaje para email inexistente, contrasena incorrecta y cuenta
    // inactiva: distinguirlos le diria a un atacante cual de los tres acerto.
    if (!cuenta || !passwordValida || !cuenta.activa) {
      throw new UnauthorizedException('Credenciales invalidas');
    }

    const accessToken = await this.tokenService.generateAccessToken({
      sub: cuenta.id,
      email: cuenta.email,
      rol: cuenta.rol,
      codigoNacional: cuenta.organizacion?.codigoNacional ?? null,
    });

    const respuesta = new AuthResponseDto();
    respuesta.accessToken = accessToken;
    respuesta.expiresIn = this.tokenService.segundosDeVida();
    return respuesta;
  }
}
