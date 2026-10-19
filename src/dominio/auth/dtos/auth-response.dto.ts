import { ApiProperty } from '@nestjs/swagger';

export class AuthResponseDto {
  @ApiProperty({ description: 'JWT que va en el header Authorization: Bearer <token>' })
  accessToken!: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType = 'Bearer';

  @ApiProperty({ description: 'Segundos de validez del token', example: 3600 })
  expiresIn!: number;
}
