import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class PasswordService {
  private readonly saltRounds: number;

  constructor(config: ConfigService) {
    this.saltRounds = config.get<number>('jwt.bcryptSaltRounds', 10);
  }

  hash(plano: string): Promise<string> {
    return bcrypt.hash(plano, this.saltRounds);
  }

  compare(plano: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plano, hash);
  }
}
