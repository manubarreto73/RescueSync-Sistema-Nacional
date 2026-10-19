import { Injectable } from '@nestjs/common';
import { Organizacion } from '@prisma/client';
import { PageResponse } from '../../../common/dtos/page-response.dto';
import { ResourceNotFoundException } from '../../../common/exceptions';
import { FindOrganizacionesQuery } from '../dtos/find-organizaciones.query';
import { OrganizacionDetalleDto, OrganizacionResponseDto } from '../dtos/organizacion-response.dto';
import { OrganizacionRepository } from '../repositories/organizacion.repository';

@Injectable()
export class OrganizacionesService {
  constructor(private readonly organizacionRepository: OrganizacionRepository) {}

  /** Interno: lo usan recursos y onboarding. */
  async findByCodigo(codigo: string): Promise<Organizacion> {
    const organizacion = await this.organizacionRepository.findByCodigo(codigo);

    if (!organizacion) {
      throw new ResourceNotFoundException(`No existe la organizacion ${codigo}`);
    }

    return organizacion;
  }

  async getAll(query: FindOrganizacionesQuery): Promise<PageResponse<OrganizacionResponseDto>> {
    const [organizaciones, total] = await this.organizacionRepository.buscar(
      { estado: query.estado, busqueda: query.busqueda?.trim() || undefined },
      query.skip,
      query.size,
    );

    return new PageResponse(
      organizaciones.map(OrganizacionResponseDto.from),
      query.page,
      query.size,
      total,
    );
  }

  async getDetalle(codigo: string): Promise<OrganizacionDetalleDto> {
    const organizacion = await this.organizacionRepository.findDetalleByCodigo(codigo, hoy());

    if (!organizacion) {
      throw new ResourceNotFoundException(`No existe la organizacion ${codigo}`);
    }

    return OrganizacionDetalleDto.fromDetalle(organizacion);
  }
}

/**
 * Inicio del dia actual en UTC. Los vencimientos son columnas DATE: una
 * certificacion que vence hoy sigue vigente durante todo el dia.
 */
export function hoy(): Date {
  const ahora = new Date();
  return new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate()));
}
