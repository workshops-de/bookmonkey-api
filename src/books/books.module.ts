import { Module } from '@nestjs/common';
import { BooksController } from './books.controller.js';
import { UsersBooksController } from './users-books.controller.js';
import { BooksService } from './books.service.js';
import { BookQueryService } from './book-query.service.js';

@Module({
  controllers: [BooksController, UsersBooksController],
  providers: [BooksService, BookQueryService],
})
export class BooksModule {}
