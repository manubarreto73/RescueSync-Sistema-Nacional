import { Injectable } from '@nestjs/common';
import { EstadoOrganizacion, Organizacion, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaTransaction } from '../../../prisma/transaction.types';

/** Organizacion con sus certificaciones vigentes y el detalle del catalogo. */
export type OrganizacionConCertificaciones = Prisma.OrganizacionGetPayload<{
  include: { certificaciones: { include: { certificacion: true } } };
}>;

@Injectable()
export class OrganizacionRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: PrismaTransaction) {
    return tx ?? this.prisma;
  }

  findByCodigo(codigo: string, tx?: PrismaTransaction): Promise<Organizacion | null> {
    return this.db(tx).organizacion.findUnique({ where: { codigoNacional: codigo } });
  }

  findManyByCodigos(codigos: string[], tx?: PrismaTransaction): Promise<Organizacion[]> {
    return this.db(tx).organizacion.findMany({ where: { codigoNacional: { in: codigos } } });
  }

  /** Solo certificaciones vigentes a la fecha: una vencida no habilita nada. */
  findDetalleByCodigo(
    codigo: string,
    hoy: Date,
    tx?: PrismaTransaction,
  ): Promise<OrganizacionConCertificaciones | null> {
    return this.db(tx).organizacion.findUnique({
      where: { codigoNacional: codigo },
      include: {
        certificaciones: {
          where: { fechaVencimiento: { gte: hoy } },
          include: { certificacion: true },
          orderBy: { certificacion: { codigo: 'asc' } },
        },
      },
    });
  }

  async buscar(
    filtros: { estado?: EstadoOrganizacion; busqueda?: string },
    skip: number,
    take: number,
  ): Promise<[Organizacion[], number]> {
    const where: Prisma.OrganizacionWhereInput = {
      ...(filtros.estado ? { estado: filtros.estado } : {}),
      ...(filtros.busqueda
        ? {
            OR: [
              { nombre: { contains: filtros.busqueda, mode: 'insensitive' } },
              { codigoNacional: { contains: filtros.busqueda, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return Promise.all([
      this.prisma.organizacion.findMany({ where, skip, take, orderBy: { codigoNacional: 'asc' } }),
      this.prisma.organizacion.count({ where }),
    ]);
  }

  existsByNombre(nombre: string): Promise<boolean> {
    return this.prisma.organizacion
      .count({ where: { nombre: { equals: nombre, mode: 'insensitive' } } })
      .then((total) => total > 0);
  }

  existsByCuit(cuit: string): Promise<boolean> {
    return this.prisma.organizacion.count({ where: { cuit } }).then((total) => total > 0);
  }

  create(data: Prisma.OrganizacionCreateInput, tx?: PrismaTransaction): Promise<Organizacion> {
    return this.db(tx).organizacion.create({ data });
  }

  update(
    id: number,
    data: Prisma.OrganizacionUpdateInput,
    tx?: PrismaTransaction,
  ): Promise<Organizacion> {
    return this.db(tx).organizacion.update({ where: { id }, data });
  }
}
