import { Injectable } from '@nestjs/common';
import { EstadoCompromiso, EstadoProyecto, NivelGravedad, Prisma } from '@prisma/client';
import { PrismaTransaction } from '../../../prisma/transaction.types';

export interface ProyectoBloqueado {
  id: number;
  estado: EstadoProyecto;
}

const DETALLE = {
  compromisos: {
    orderBy: { id: 'asc' },
    include: {
      organizacion: { select: { codigoNacional: true } },
      items: { orderBy: { id: 'asc' }, include: { recurso: { select: { categoria: true } } } },
    },
  },
} satisfies Prisma.ProyectoInclude;

export type ProyectoDetalle = Prisma.ProyectoGetPayload<{ include: typeof DETALLE }>;

export type CompromisoDetalle = ProyectoDetalle['compromisos'][number];

/**
 * Acceso a proyectos y compromisos. Todos los metodos reciben la transaccion:
 * los proyectos solo se modifican con la fila bloqueada.
 */
@Injectable()
export class ProyectoRepository {
  /**
   * Crea el proyecto si no existe. ON CONFLICT DO NOTHING en vez de un
   * "buscar y si no esta crear": con dos adjudicaciones simultaneas del mismo
   * proyecto, ambas verian que no existe y la segunda fallaria por clave
   * duplicada. Asi la segunda espera a la primera y sigue de largo.
   */
  async crearSiNoExiste(
    referencia: string,
    gravedad: NivelGravedad,
    tx: PrismaTransaction,
  ): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO proyectos (referencia_externa, gravedad)
      VALUES (${referencia}, ${gravedad}::"NivelGravedad")
      ON CONFLICT (referencia_externa) DO NOTHING`;
  }

  /**
   * Bloquea la fila del proyecto. Es el primer lock de toda operacion sobre
   * un proyecto, y los recursos se bloquean despues: un orden fijo
   * (proyecto -> recursos ordenados por id) para que no haya deadlocks.
   */
  async bloquear(referencia: string, tx: PrismaTransaction): Promise<ProyectoBloqueado | null> {
    const filas = await tx.$queryRaw<ProyectoBloqueado[]>`
      SELECT id, estado::text AS estado
      FROM proyectos
      WHERE referencia_externa = ${referencia}
      FOR UPDATE`;

    return filas[0] ?? null;
  }

  findDetalle(referencia: string, tx: PrismaTransaction): Promise<ProyectoDetalle | null> {
    return tx.proyecto.findUnique({ where: { referenciaExterna: referencia }, include: DETALLE });
  }

  findCompromisos(
    proyectoId: number,
    filtro: { organizacionIds?: number[]; estado?: EstadoCompromiso },
    tx: PrismaTransaction,
  ): Promise<CompromisoDetalle[]> {
    return tx.compromiso.findMany({
      where: {
        proyectoId,
        ...(filtro.organizacionIds ? { organizacionId: { in: filtro.organizacionIds } } : {}),
        ...(filtro.estado ? { estado: filtro.estado } : {}),
      },
      orderBy: { id: 'asc' },
      include: DETALLE.compromisos.include,
    });
  }

  crearCompromiso(
    proyectoId: number,
    organizacionId: number,
    items: { recursoId: number; cantidad: number }[],
    tx: PrismaTransaction,
  ): Promise<unknown> {
    return tx.compromiso.create({
      data: { proyectoId, organizacionId, items: { create: items } },
    });
  }

  async liberarCompromisos(proyectoId: number, fecha: Date, tx: PrismaTransaction): Promise<void> {
    await tx.compromiso.updateMany({
      where: { proyectoId, estado: EstadoCompromiso.ACTIVO },
      data: { estado: EstadoCompromiso.LIBERADO, fechaLiberacion: fecha },
    });
  }

  async finalizar(proyectoId: number, fecha: Date, tx: PrismaTransaction): Promise<void> {
    await tx.proyecto.update({
      where: { id: proyectoId },
      data: { estado: EstadoProyecto.FINALIZADO, fechaCierre: fecha },
    });
  }
}
