import { ApiProperty } from '@nestjs/swagger';

export class PageResponse<T> {
  @ApiProperty({ isArray: true })
  content: T[];

  @ApiProperty()
  page: number;

  @ApiProperty()
  size: number;

  @ApiProperty()
  totalElements: number;

  @ApiProperty()
  totalPages: number;

  constructor(content: T[], page: number, size: number, totalElements: number) {
    this.content = content;
    this.page = page;
    this.size = size;
    this.totalElements = totalElements;
    this.totalPages = size > 0 ? Math.ceil(totalElements / size) : 0;
  }
}
