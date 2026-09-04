import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { INestApplication } from '@nestjs/common';

const HERE = dirname(fileURLToPath(import.meta.url));

export const KNOWN_ISBN = '1001606140805';
export const KNOWN_TITLE = 'Java Web Scraping Handbook';

/** RFC-4122 v4 UUID. */
const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isUuid = (value: unknown): boolean =>
  typeof value === 'string' && UUID_V4_RE.test(value);

const REPO_SEED = join(HERE, '..', 'assets', 'db-original.json');

export interface TmpDb {
  dbPath: string;
  cleanup: () => void;
}

/**
 * Legt eine Wegwerf-Kopie des Seeds in `os.tmpdir()` an und verdrahtet sie über
 * `DB_PATH` / `SEED_PATH`. MUSS vor dem Import von `AppModule` aufgerufen werden.
 */
export function setupTmpDb(): TmpDb {
  const dir = mkdtempSync(join(tmpdir(), 'bookmonkey-api-'));
  const dbPath = join(dir, 'db.json');
  copyFileSync(REPO_SEED, dbPath);
  process.env.DB_PATH = dbPath;
  process.env.SEED_PATH = REPO_SEED;
  process.env.PUBLIC_DIR = join(HERE, '..', 'assets', 'public');
  return {
    dbPath,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

export async function bootstrapTestApp(): Promise<INestApplication> {
  // Verzögerte Imports: erst nachdem DB_PATH gesetzt ist.
  const { Test } = await import('@nestjs/testing');
  const { SwaggerModule } = await import('@nestjs/swagger');
  const { AppModule } = await import('../src/app.module');
  const { configureApp, buildSwaggerDocument } = await import('../src/main');

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  SwaggerModule.setup('api', app, buildSwaggerDocument(app));
  await app.init();
  return app;
}
