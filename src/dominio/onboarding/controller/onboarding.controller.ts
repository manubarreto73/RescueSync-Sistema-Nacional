import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../common/decorators';
import { OnboardingOngDto, OnboardingResponseDto } from '../dtos/onboarding-ong.dto';
import { OnboardingService } from '../services/onboarding.service';

@ApiTags('Onboarding')
@Controller({ path: 'onboarding', version: '1' })
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Public()
  @Post('ong')
  @Throttle({ long: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Registra una ONG en la red y crea su cuenta de acceso' })
  @ApiResponse({ status: 201, type: OnboardingResponseDto })
  @ApiResponse({ status: 409, description: 'Nombre, CUIT o email ya registrados' })
  registrar(@Body() dto: OnboardingOngDto): Promise<OnboardingResponseDto> {
    return this.onboardingService.registrar(dto);
  }
}
