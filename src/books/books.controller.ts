import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ApiBookQuery } from '../common/api-book-query.decorator.js';
import {
  BOOK_DRAFT_INPUT_SCHEMA,
  BOOK_OUTPUT_SCHEMA,
  BOOK_UPDATE_INPUT_SCHEMA,
  VALIDATION_ERROR_SCHEMA,
} from '../common/openapi.js';
import {
  bookDraftSchema,
  updateBookSchema,
  type Book,
  type BookDraft,
  type BookUpdate,
} from '../domain/index.js';
import { BooksService } from './books.service.js';
import { BookQueryService } from './book-query.service.js';

// Alle /books-Endpunkte sind bewusst offen (anonym nutzbar) – so wie im
// Ist-Server, dessen Oktal-Guard-System nie verdrahtet war.
@ApiTags('books')
@Controller('books')
export class BooksController {
  constructor(
    private readonly books: BooksService,
    private readonly queries: BookQueryService,
  ) {}

  @Get()
  @ApiBookQuery()
  @ApiOkResponse({ schema: { type: 'array', items: BOOK_OUTPUT_SCHEMA } })
  list(
    @Query() query: Record<string, string | string[]>,
    @Res({ passthrough: true }) res: Response,
  ): Book[] {
    return this.queries.apply(this.books.findAll(), query, res);
  }

  // Muss vor `@Get(':isbn')` stehen, sonst würde "exists" als isbn interpretiert.
  @Get(':isbn/exists')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        isbn: { type: 'string' },
        exists: { type: 'boolean' },
      },
      required: ['isbn', 'exists'],
    },
  })
  exists(@Param('isbn') isbn: string): { isbn: string; exists: boolean } {
    return { isbn, exists: this.books.existsByIsbn(isbn) };
  }

  @Get(':isbn')
  @ApiOkResponse({ schema: BOOK_OUTPUT_SCHEMA })
  findOne(@Param('isbn') isbn: string): Book {
    return this.books.findByIsbn(isbn);
  }

  @Post()
  @HttpCode(201)
  @ApiBody({ schema: BOOK_DRAFT_INPUT_SCHEMA })
  @ApiResponse({ status: 400, schema: VALIDATION_ERROR_SCHEMA })
  create(
    @Body(new ZodValidationPipe(bookDraftSchema)) draft: BookDraft,
  ): Book {
    return this.books.create(draft);
  }

  @Put(':isbn')
  @ApiBody({ schema: BOOK_DRAFT_INPUT_SCHEMA })
  @ApiResponse({ status: 400, schema: VALIDATION_ERROR_SCHEMA })
  replace(
    @Param('isbn') isbn: string,
    @Body(new ZodValidationPipe(bookDraftSchema)) draft: BookDraft,
  ): Book {
    return this.books.replace(isbn, draft);
  }

  @Patch(':isbn')
  @ApiBody({ schema: BOOK_UPDATE_INPUT_SCHEMA })
  @ApiResponse({ status: 400, schema: VALIDATION_ERROR_SCHEMA })
  update(
    @Param('isbn') isbn: string,
    @Body(new ZodValidationPipe(updateBookSchema)) patch: BookUpdate,
  ): Book {
    return this.books.update(isbn, patch);
  }

  @Delete(':isbn')
  @HttpCode(200)
  remove(@Param('isbn') isbn: string): Record<string, never> {
    this.books.remove(isbn);
    return {};
  }
}
