import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  copyFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Book } from '../domain/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface UserRecord {
  id: number;
  email: string;
  password: string;
  [k: string]: unknown;
}

export interface DbShape {
  users: UserRecord[];
  books: Book[];
}

@Injectable()
export class DatabaseService implements OnModuleInit {
  private readonly logger = new Logger('Database');
  /**
   * dist/assets/db-original.json (Assets werden per nest-cli.json dorthin
   * kopiert). `SEED_PATH` überschreibt – u. a. von den E2E-Tests genutzt, die
   * ohne Build gegen `src/` laufen.
   */
  private readonly seedPath =
    process.env.SEED_PATH || join(__dirname, '..', 'assets', 'db-original.json');
  /** dist/db.json bzw. DB_PATH-Override. */
  private readonly dbPath =
    process.env.DB_PATH || join(__dirname, '..', 'db.json');
  private data!: DbShape;

  onModuleInit(): void {
    if (!existsSync(this.dbPath)) this.restoreSeed();
    else this.load();
  }

  private load(): void {
    this.data = JSON.parse(readFileSync(this.dbPath, 'utf-8')) as DbShape;
    this.data.users ??= [];
    this.data.books ??= [];
    this.logger.log(
      `Loaded ${this.data.books.length} books, ${this.data.users.length} users from ${this.dbPath}`,
    );
  }

  restoreSeed(): void {
    copyFileSync(this.seedPath, this.dbPath);
    this.load();
    this.logger.log('Database reset from seed');
  }

  commit(): void {
    writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2));
  }

  get books(): Book[] {
    return this.data.books;
  }

  get users(): UserRecord[] {
    return this.data.users;
  }
}
