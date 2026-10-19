import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'bonita@rescuesync.ar' })
  @IsEmail({}, { message: 'El email no tiene un formato valido' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;

  @ApiProperty({ example: 'Bonita2026!' })
  @IsString()
  @Length(8, 72)
  password!: string;
}
