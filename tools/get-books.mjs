/**
 * Offline-Hilfsskript (NICHT Teil der Laufzeit, nicht in `package.json` `files`).
 *
 * Erzeugt den Seed `assets/db-original.json` neu aus `api.itbook.store` und lädt
 * die Cover nach `assets/public/covers/`. Port von `getBooks.js` mit den
 * 4.0.0-Anpassungen: `id` = GUID, `price` = Number, `currency` = 'USD'.
 *
 *   node tools/get-books.mjs
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const coversDir = join(repoRoot, 'assets', 'public', 'covers');
const seedPath = join(repoRoot, 'assets', 'db-original.json');

async function download(url, name) {
  const response = await fetch(url);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(join(coversDir, `${name}.png`), buffer);
}

async function createBook(bookIsbn) {
  const response = await fetch(`https://api.itbook.store/1.0/books/${bookIsbn}`);
  const book = await response.json();

  const {
    title,
    subtitle,
    isbn13: isbn,
    desc: abstract,
    authors: author,
    publisher,
    price,
    pages,
    year,
  } = book;

  await download(book.image, book.isbn13);

  return {
    id: randomUUID(),
    title,
    subtitle,
    isbn,
    abstract,
    author,
    publisher,
    price: Number(String(price).replace(/[^0-9.]/g, '')),
    currency: 'USD',
    numPages: +pages,
    cover: `http://localhost:4730/covers/${isbn}.png`,
    userId: 1,
    publishedAt: year ? `${year}-01-01` : null,
    coAuthors: [],
  };
}

async function getBooks(page) {
  const response = await fetch(
    `https://api.itbook.store/1.0/search/web&page=${page}`,
  );
  const json = await response.json();
  return Promise.all(json.books.map((b) => createBook(b.isbn13)));
}

const pages = await Promise.all(
  Array.from({ length: 25 }, (_, i) => i + 1).map(getBooks),
);

const users = [
  {
    email: 'admin@bookmonkey.api',
    password: '$2a$10$Evsbmwpt5JIsDb3hSRklq.u7zapUWPCNPl8EFE1igm9B1bqroGfSq',
    id: 1,
  },
];

await fs.writeFile(
  seedPath,
  JSON.stringify({ users, books: pages.flat() }, null, 2) + '\n',
);
console.log(`Seed written to ${seedPath}`);
