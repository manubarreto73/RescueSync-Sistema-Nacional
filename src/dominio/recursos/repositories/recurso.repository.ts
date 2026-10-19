import { Injectable } from '@nestjs/common';
import { CategoriaRecurso, Prisma, Recurso } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaTransaction } from '../../../prisma/transaction.types';

/** Fila de recursos leida bajo SELECT ... FOR UPDATE. */
export interface RecursoBloqueado {
  id: number;
  organizacionId: number;
  categoria: CategoriaRecurso;
  cantidadTotal: number;
  cantidadComprometida: number;
}

/**
 * Acceso a recursos, incluido el bloqueo pesimista de filas.
 *
 * Prisma no expone FOR UPDATE en su API, por eso los dos metodos de bloqueo
 * usan $queryRaw. Solo tienen sentido dentro de una transaccion: fuera de
 * ella el lock se libera apenas termina la propia consulta.
 */
@Injectable()
export class RecursoRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: PrismaTransaction) {
    return tx ?? this.prisma;
  }

  findByOrganizacion(organizacionId: number, tx?: PrismaTransaction): Promise<Recurso[]> {
    return this.db(tx).recurso.findMany({
      where: { organizacionId },
      orderBy: { categoria: 'asc' },
    });
  }

  findManyByOrganizaciones(organizacionIds: number[], tx?: PrismaTransaction): Promise<Recurso[]> {
    return this.db(tx).recurso.findMany({ where: { organizacionId: { in: organizacionIds } } });
  }

  /**
   * Bloquea las filas indicadas hasta el fin de la transaccion. Otra
   * transaccion que quiera bloquear alguna de ellas espera aca.
   *
   * ORDER BY id es lo que evita los deadlocks: si una transaccion bloqueara
   * A y despues B mientras otra bloquea B y despues A, quedarian esperandose
   * mutuamente. Con un orden fijo, todas bloquean en la misma secuencia.
   */
  bloquear(ids: number[], tx: PrismaTransaction): Promise<RecursoBloqueado[]> {
    if (ids.length === 0) return Promise.resolve([]);

    return tx.$queryRaw<RecursoBloqueado[]>`
      SELECT id,
             organizacion_id       AS "organizacionId",
             categoria::text       AS "categoria",
             cantidad_total        AS "cantidadTotal",
             cantidad_comprometida AS "cantidadComprometida"
      FROM recursos
      WHERE id = ANY(${ids}::int[])
      ORDER BY id
      FOR UPDATE`;
  }

  /** Bloquea todo el inventario de una organizacion (edicion de inventario). */
  bloquearDeOrganizacion(
    organizacionId: number,
    tx: PrismaTransaction,
  ): Promise<RecursoBloqueado[]> {
    return tx.$queryRaw<RecursoBloqueado[]>`
      SELECT id,
             organizacion_id       AS "organizacionId",
             categoria::text       AS "categoria",
             cantidad_total        AS "cantidadTotal",
             cantidad_comprometida AS "cantidadComprometida"
      FROM recursos
      WHERE organizacion_id = ${organizacionId}
      ORDER BY id
      FOR UPDATE`;
  }

  upsert(
    organizacionId: number,
    datos: { categoria: CategoriaRecurso; unidad: string; cantidadTotal: number },
    tx: PrismaTransaction,
  ): Promise<Recurso> {
    return tx.recurso.upsert({
      where: { organizacionId_categoria: { organizacionId, categoria: datos.categoria } },
      create: { organizacionId, ...datos },
      update: { unidad: datos.unidad, cantidadTotal: datos.cantidadTotal },
    });
  }

  /** Suma (o resta, con delta negativo) a lo comprometido. Se llama con la fila ya bloqueada. */
  ajustarComprometida(id: number, delta: number, tx: PrismaTransaction): Promise<Recurso> {
    const data: Prisma.RecursoUpdateInput =
      delta >= 0
        ? { cantidadComprometida: { increment: delta } }
        : { cantidadComprometida: { decrement: -delta } };

    return tx.recurso.update({ where: { id }, data });
  }
}
