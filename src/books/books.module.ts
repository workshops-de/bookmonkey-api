import { Module } from '@nestjs/common';
import { BooksController } from './books.controller';
import { UsersBooksController } from './users-books.controller';
import { BooksService } from './books.service';
import { BookQueryService } from './book-query.service';

@Module({
  controllers: [BooksController, UsersBooksController],
  providers: [BooksService, BookQueryService],
})
export class BooksModule {}
