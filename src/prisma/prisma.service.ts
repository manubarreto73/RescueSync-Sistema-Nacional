import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';

/** Cliente de Prisma integrado al ciclo de vida de Nest. Unico punto de acceso a la base. */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService) {
    const logging = config.get<boolean>('database.logging');

    super({
      datasources: { db: { url: config.getOrThrow<string>('database.url') } },
      log: logging
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'stdout', level: 'warn' },
            { emit: 'stdout', level: 'error' },
          ]
        : [{ emit: 'stdout', level: 'error' }],
    });

    if (logging) {
      this.$on('query' as never, (e: Prisma.QueryEvent) => {
        this.logger.debug(`${e.query} -- params: ${e.params} (${e.duration}ms)`);
      });
    }
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Conectado a PostgreSQL');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
