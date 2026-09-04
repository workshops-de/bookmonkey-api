import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import type { Book, BookDraft, BookUpdate } from '../domain';

@Injectable()
export class BooksService {
  constructor(private readonly db: DatabaseService) {}

  findAll(): Book[] {
    return this.db.books;
  }

  findByIsbn(isbn: string): Book {
    const book = this.db.books.find((b) => b.isbn === isbn);
    if (!book) throw new NotFoundException();
    return book;
  }

  create(draft: BookDraft): Book {
    const book: Book = {
      ...draft,
      id: randomUUID(),
      cover:
        draft.cover ?? `http://localhost:4730/covers/${draft.isbn}.png`,
    };
    // Ist-Verhalten: doppelte isbn wird zugelassen (kein Konflikt-Check).
    this.db.books.push(book);
    this.db.commit();
    return book;
  }

  replace(isbn: string, draft: BookDraft): Book {
    const index = this.db.books.findIndex((b) => b.isbn === isbn);
    if (index === -1) throw new NotFoundException();
    const existing = this.db.books[index];
    const replaced: Book = { ...draft, id: existing.id, isbn };
    this.db.books[index] = replaced;
    this.db.commit();
    return replaced;
  }

  update(isbn: string, patch: BookUpdate): Book {
    const index = this.db.books.findIndex((b) => b.isbn === isbn);
    if (index === -1) throw new NotFoundException();
    const existing = this.db.books[index];
    // Nur tatsächlich gesetzte Keys mergen (kein currency-Default-Überschreiben).
    const merged: Book = { ...existing };
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) {
        (merged as unknown as Record<string, unknown>)[key] = value;
      }
    }
    merged.id = existing.id;
    merged.isbn = existing.isbn;
    this.db.books[index] = merged;
    this.db.commit();
    return merged;
  }

  remove(isbn: string): void {
    const index = this.db.books.findIndex((b) => b.isbn === isbn);
    if (index === -1) throw new NotFoundException();
    this.db.books.splice(index, 1);
    this.db.commit();
  }
}
