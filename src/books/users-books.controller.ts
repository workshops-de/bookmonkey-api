import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiBookQuery } from '../common/api-book-query.decorator.js';
import { BOOK_OUTPUT_SCHEMA } from '../common/openapi.js';
import type { Book } from '../domain/index.js';
import { BooksService } from './books.service.js';
import { BookQueryService } from './book-query.service.js';

@ApiTags('books')
@Controller('users')
export class UsersBooksController {
  constructor(
    private readonly books: BooksService,
    private readonly queries: BookQueryService,
  ) {}

  @Get(':id/books')
  @ApiBookQuery()
  @ApiOkResponse({ schema: { type: 'array', items: BOOK_OUTPUT_SCHEMA } })
  findByUser(
    @Param('id') id: string,
    @Query() query: Record<string, string | string[]>,
    @Res({ passthrough: true }) res: Response,
  ): Book[] {
    const subset = this.books
      .findAll()
      .filter((b) => String(b.userId) === String(id));
    return this.queries.apply(subset, query, res);
  }
}
