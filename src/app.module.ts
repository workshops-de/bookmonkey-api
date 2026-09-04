import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { BooksModule } from './books/books.module';
import { NoCacheMiddleware } from './common/no-cache.middleware';
import { DatabaseModule } from './database/database.module';
import { DevModule } from './dev/dev.module';

// Hinweis: Die statischen Cover-Dateien (`/covers/*.png`) werden nicht über ein
// Nest-Modul, sondern als Express-Middleware in `configureApp()` (main.ts)
// eingehängt – so greift es in Produktion und im E2E-Test gleichermaßen.
@Module({
  imports: [DatabaseModule, BooksModule, AuthModule, DevModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(NoCacheMiddleware)
      .forRoutes('books', 'users', 'dev', 'login', 'signin', 'register', 'signup');
  }
}
