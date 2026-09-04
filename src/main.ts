import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import morgan from 'morgan';
import compression from 'compression';
import { NestFactory } from '@nestjs/core';
import {
  DocumentBuilder,
  type OpenAPIObject,
  SwaggerModule,
} from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ZodExceptionFilter } from './common/zod-exception.filter';
import { LegacyStringExceptionFilter } from './common/legacy-string-exception.filter';

/** Wendet dieselbe Laufzeit-Konfiguration wie `bootstrap()` an – auch von den E2E-Tests genutzt. */
export function configureApp(app: INestApplication): void {
  app.use(morgan('dev'));
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));

  // Statische Cover-Dateien: dist/assets/public/covers/<isbn>.png
  // (PUBLIC_DIR-Override für die E2E-Tests, die ohne Build gegen src/ laufen).
  const publicDir =
    process.env.PUBLIC_DIR || join(__dirname, 'assets', 'public');
  const coversHandler = express.static(join(publicDir, 'covers'), {
    fallthrough: true,
    index: false,
  });
  app.use('/covers', (req: Request, res: Response, next: NextFunction) =>
    coversHandler(req, res, next),
  );
  app.enableCors({
    origin: true,
    credentials: true,
    exposedHeaders: ['X-Total-Count', 'Link'],
  });
  app.useGlobalFilters(
    new ZodExceptionFilter(),
    new LegacyStringExceptionFilter(),
  );
  app.enableShutdownHooks();
}

export function buildSwaggerDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('BookMonkey API')
    .setDescription(
      'Demo-Backend für workshops.de – Bücher-CRUD, Auth, Dev-Reset.',
    )
    .setVersion('4.0.0')
    .build();
  return SwaggerModule.createDocument(app, config);
}

export async function bootstrap(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write('Usage: bookmonkey-api [--port <number>]\n');
    return;
  }
  const portArgIdx = argv.indexOf('--port');
  const port = Number(
    (portArgIdx >= 0 ? argv[portArgIdx + 1] : undefined) ??
      process.env.PORT ??
      4730,
  );

  process.stdout.write(
    readFileSync(join(__dirname, 'assets', 'banner.txt'), 'ascii') + '\n',
  );

  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
  configureApp(app);

  SwaggerModule.setup('api', app, buildSwaggerDocument(app));

  await app.listen(port);
  process.stdout.write(
    `BookMonkey API läuft auf http://localhost:${port} — Doku: http://localhost:${port}/api\n`,
  );
}

// Beim direkten Start (CLI/`bin`) booten; unter Jest (`NODE_ENV=test`) nicht.
if (process.env.NODE_ENV !== 'test') {
  void bootstrap();
}
