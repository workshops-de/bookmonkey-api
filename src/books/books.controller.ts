import {
  BadRequestException,
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

  // Trainings-Feature: `?dev-error=true` erzwingt auf jedem Endpunkt einen
  // 400er, damit im Workshop Client-seitiges Error-Handling geübt werden kann.
  private assertNoDevError(devError?: string): void {
    if (devError === 'true') {
      throw new BadRequestException(
        'This 400 error was triggered intentionally via ?dev-error=true for testing purposes.',
      );
    }
  }

  @Get()
  @ApiBookQuery()
  @ApiOkResponse({ schema: { type: 'array', items: BOOK_OUTPUT_SCHEMA } })
  @ApiResponse({ status: 400, schema: VALIDATION_ERROR_SCHEMA })
  list(
    @Query() query: Record<string, string | string[]>,
    @Query('dev-error') devError: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Book[] {
    this.assertNoDevError(devError);
    const { 'dev-error': _devError, ...filters } = query;
    return this.queries.apply(this.books.findAll(), filters, res);
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
  @ApiResponse({ status: 400, schema: VALIDATION_ERROR_SCHEMA })
  exists(
    @Param('isbn') isbn: string,
    @Query('dev-error') devError: string | undefined,
  ): { isbn: string; exists: boolean } {
    this.assertNoDevError(devError);
    return { isbn, exists: this.books.existsByIsbn(isbn) };
  }

  @Get(':isbn')
  @ApiOkResponse({ schema: BOOK_OUTPUT_SCHEMA })
  @ApiResponse({ status: 400, schema: VALIDATION_ERROR_SCHEMA })
  findOne(
    @Param('isbn') isbn: string,
    @Query('dev-error') devError: string | undefined,
  ): Book {
    this.assertNoDevError(devError);
    return this.books.findByIsbn(isbn);
  }

  @Post()
  @HttpCode(201)
  @ApiBody({ schema: BOOK_DRAFT_INPUT_SCHEMA })
  @ApiResponse({ status: 400, schema: VALIDATION_ERROR_SCHEMA })
  create(
    @Body(new ZodValidationPipe(bookDraftSchema)) draft: BookDraft,
    @Query('dev-error') devError: string | undefined,
  ): Book {
    this.assertNoDevError(devError);
    return this.books.create(draft);
  }

  @Put(':isbn')
  @ApiBody({ schema: BOOK_DRAFT_INPUT_SCHEMA })
  @ApiResponse({ status: 400, schema: VALIDATION_ERROR_SCHEMA })
  replace(
    @Param('isbn') isbn: string,
    @Body(new ZodValidationPipe(bookDraftSchema)) draft: BookDraft,
    @Query('dev-error') devError: string | undefined,
  ): Book {
    this.assertNoDevError(devError);
    return this.books.replace(isbn, draft);
  }

  @Patch(':isbn')
  @ApiBody({ schema: BOOK_UPDATE_INPUT_SCHEMA })
  @ApiResponse({ status: 400, schema: VALIDATION_ERROR_SCHEMA })
  update(
    @Param('isbn') isbn: string,
    @Body(new ZodValidationPipe(updateBookSchema)) patch: BookUpdate,
    @Query('dev-error') devError: string | undefined,
  ): Book {
    this.assertNoDevError(devError);
    return this.books.update(isbn, patch);
  }

  @Delete(':isbn')
  @HttpCode(200)
  @ApiResponse({ status: 400, schema: VALIDATION_ERROR_SCHEMA })
  remove(
    @Param('isbn') isbn: string,
    @Query('dev-error') devError: string | undefined,
  ): Record<string, never> {
    this.assertNoDevError(devError);
    this.books.remove(isbn);
    return {};
  }
}
