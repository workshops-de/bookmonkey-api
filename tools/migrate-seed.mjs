/**
 * Einmal-Skript: migriert das Repo-Root `db-original.json` (json-server-Format,
 * 1 User, 250 Bücher) in den neuen Seed `assets/db-original.json`.
 *
 *   node tools/migrate-seed.mjs
 *
 * Transformationen pro Buch:
 *   - `id`       -> neue `crypto.randomUUID()` (nicht mehr identisch mit `isbn`)
 *   - `price`    -> Number(String(price).replace(/[^0-9.]/g, '')); NaN -> Feld weglassen
 *   - `currency` -> 'USD' (Seed-Preise sind dollar-denominiert)
 *   - alle übrigen Felder unverändert, Reihenfolge beibehalten
 * `users` wird unverändert übernommen.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

const source = JSON.parse(readFileSync(join(repoRoot, 'db-original.json'), 'utf-8'));

const books = source.books.map((book) => {
  const { id: _oldId, price, ...rest } = book;
  const parsed = Number(String(price).replace(/[^0-9.]/g, ''));
  const next = {
    id: randomUUID(),
    ...rest,
  };
  if (!Number.isNaN(parsed)) {
    next.price = parsed;
  }
  next.currency = 'USD';
  return next;
});

const migrated = {
  users: source.users,
  books,
};

const outPath = join(repoRoot, 'assets', 'db-original.json');
writeFileSync(outPath, JSON.stringify(migrated, null, 2) + '\n');
console.log(
  `Wrote ${books.length} books, ${migrated.users.length} users to ${outPath}`,
);
