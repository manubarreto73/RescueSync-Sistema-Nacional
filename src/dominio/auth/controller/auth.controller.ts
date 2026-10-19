import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../common/decorators';
import { AuthResponseDto } from '../dtos/auth-response.dto';
import { LoginDto } from '../dtos/login.dto';
import { AuthService } from '../services/auth.service';

@ApiTags('Auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Limite propio, mas bajo que el general: es el endpoint mas atacado de
   * cualquier API. Alcanza de sobra para los conectores de Bonita, que hacen
   * un login por ejecucion.
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ long: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Inicia sesion y devuelve el access token JWT' })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Credenciales invalidas' })
  @ApiResponse({ status: 429, description: 'Demasiados intentos' })
  login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
  }
}
