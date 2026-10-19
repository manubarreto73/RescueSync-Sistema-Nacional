import { HttpException, HttpStatus } from '@nestjs/common';

/** Violacion de una regla de negocio sobre datos validos en forma. */
export class BusinessException extends HttpException {
  constructor(message: string) {
    super(message, HttpStatus.BAD_REQUEST);
  }
}

/** Entidad inexistente. */
export class ResourceNotFoundException extends HttpException {
  constructor(message: string) {
    super(message, HttpStatus.NOT_FOUND);
  }
}

/**
 * La operacion choca con el estado actual: duplicados, stock insuficiente,
 * proyecto ya finalizado. `detalle` viaja en el cuerpo del error junto al
 * mensaje, para que el cliente sepa exactamente que fallo.
 */
export class ConflictoException extends HttpException {
  constructor(message: string, detalle: Record<string, unknown> = {}) {
    super({ message, ...detalle }, HttpStatus.CONFLICT);
  }
}
