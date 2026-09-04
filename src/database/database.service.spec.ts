import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseService } from './database.service';

const REPO_SEED = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'assets',
  'db-original.json',
);

describe('DatabaseService', () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bm-db-'));
    dbPath = join(dir, 'db.json');
    process.env.DB_PATH = dbPath;
    process.env.SEED_PATH = REPO_SEED;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.DB_PATH;
    delete process.env.SEED_PATH;
  });

  it('onModuleInit creates the db from the seed when the file is missing', () => {
    const svc = new DatabaseService();
    svc.onModuleInit();
    expect(svc.books).toHaveLength(250);
    expect(svc.users).toHaveLength(1);
    expect(readFileSync(dbPath, 'utf-8')).toContain('"books"');
  });

  it('load reads an existing file', () => {
    copyFileSync(REPO_SEED, dbPath);
    const svc = new DatabaseService();
    svc.onModuleInit();
    expect(svc.books.length).toBe(250);
  });

  it('commit persists in-place mutations', () => {
    const svc = new DatabaseService();
    svc.onModuleInit();
    svc.books.push({ ...svc.books[0], id: 'x', isbn: 'mutant' });
    svc.commit();
    const onDisk = JSON.parse(readFileSync(dbPath, 'utf-8'));
    expect(onDisk.books.some((b: { isbn: string }) => b.isbn === 'mutant')).toBe(true);
  });

  it('restoreSeed overwrites local changes', () => {
    writeFileSync(dbPath, JSON.stringify({ users: [], books: [] }));
    const svc = new DatabaseService();
    svc.onModuleInit();
    expect(svc.books).toHaveLength(0);
    svc.restoreSeed();
    expect(svc.books).toHaveLength(250);
  });
});
