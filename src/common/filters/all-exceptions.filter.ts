import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { ErrorResponse } from './error-response';

interface Resolucion {
  status: number;
  message: string | string[];
  detalle?: Record<string, unknown>;
}

/**
 * Manejador global de errores: atrapa todo lo que se propague desde un
 * controller o servicio y lo traduce a un unico contrato de error.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, message, detalle } = this.resolve(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${request.method} ${request.url} -> ${status}: ${JSON.stringify(message)}`);
    }

    const body: ErrorResponse = {
      status,
      message,
      ...detalle,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    response.status(status).json(body);
  }

  private resolve(exception: unknown): Resolucion {
    // 1. Excepciones HTTP de Nest, incluidas las propias y las del ValidationPipe.
    //    Lo que el payload traiga ademas de message/error/statusCode se
    //    conserva como detalle (por ejemplo, los faltantes de un compromiso).
    if (exception instanceof HttpException) {
      const payload = exception.getResponse();

      if (typeof payload === 'string') {
        return { status: exception.getStatus(), message: payload };
      }

      const {
        message,
        error: _error,
        statusCode: _statusCode,
        ...detalle
      } = payload as Record<string, unknown>;

      return {
        status: exception.getStatus(),
        message: (message as string | string[] | undefined) ?? exception.message,
        detalle,
      };
    }

    // 2. Errores conocidos de Prisma (codigos P2xxx).
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002': // unique constraint
          return {
            status: HttpStatus.CONFLICT,
            message: `Ya existe un registro con ese ${this.campos(exception)}`,
          };
        case 'P2003': // foreign key constraint
          return {
            status: HttpStatus.CONFLICT,
            message: 'No se puede operar: el registro esta referenciado por otro',
          };
        case 'P2025': // registro requerido no encontrado
          return { status: HttpStatus.NOT_FOUND, message: 'El registro no existe' };
        default:
          this.logger.error(`Prisma ${exception.code}: ${exception.message}`);
          return {
            status: HttpStatus.INTERNAL_SERVER_ERROR,
            message: 'Error al acceder a la base de datos',
          };
      }
    }

    // El CHECK de recursos disparado: algun camino se salteo el bloqueo. Para
    // el cliente es lo mismo que un stock insuficiente.
    if (
      exception instanceof Prisma.PrismaClientUnknownRequestError &&
      exception.message.includes('recursos_cantidad_comprometida_check')
    ) {
      return {
        status: HttpStatus.CONFLICT,
        message: 'La operacion dejaria el recurso sobre-asignado',
      };
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      this.logger.error(`Query mal construida: ${exception.message}`);
      return { status: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Error interno del servidor' };
    }

    if (exception instanceof Prisma.PrismaClientInitializationError) {
      return { status: HttpStatus.SERVICE_UNAVAILABLE, message: 'Base de datos no disponible' };
    }

    // 3. Cualquier otra cosa: no se filtra el detalle interno al cliente.
    return { status: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Error interno del servidor' };
  }

  /** Extrae del error P2002 el nombre del campo que violo la restriccion unica. */
  private campos(exception: Prisma.PrismaClientKnownRequestError): string {
    const target = (exception.meta as { target?: string[] | string } | undefined)?.target;
    if (Array.isArray(target)) return target.join(', ');
    return target ?? 'valor';
  }
}
