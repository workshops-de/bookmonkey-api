import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import type { Book } from '../domain/index.js';

type RawQuery = Record<string, string | string[] | undefined>;

const RESERVED = new Set([
  '_page',
  '_limit',
  '_sort',
  '_order',
  '_start',
  '_end',
  'q',
]);

const OPERATOR_RE = /^(.+)_(gte|lte|ne|like)$/;

const asArray = (value: string | string[] | undefined): string[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

const isNumeric = (value: unknown): boolean =>
  value !== '' && value !== null && !Number.isNaN(Number(value));

/**
 * json-server-Query-Emulation (voller dokumentierter Umfang).
 * Pipeline: Volltext `q` → Feld-Filter/Operatoren → Sortierung → Pagination → Header.
 */
@Injectable()
export class BookQueryService {
  apply(all: Book[], raw: RawQuery, res: Response): Book[] {
    let items = all.slice();

    items = this.applyFullText(items, raw);
    items = this.applyFieldFilters(items, raw);
    items = this.applySort(items, raw);

    const total = items.length;
    return this.applyPagination(items, raw, res, total);
  }

  private applyFullText(items: Book[], raw: RawQuery): Book[] {
    if (raw.q === undefined) return items;
    const needle = String(Array.isArray(raw.q) ? raw.q[0] : raw.q).toLowerCase();
    if (!needle) return items;
    return items.filter((book) =>
      JSON.stringify(book).toLowerCase().includes(needle),
    );
  }

  private applyFieldFilters(items: Book[], raw: RawQuery): Book[] {
    const keys = Object.keys(raw).filter((key) => !RESERVED.has(key));
    if (keys.length === 0) return items;

    return items.filter((book) =>
      keys.every((key) => {
        const values = asArray(raw[key]);
        if (values.length === 0) return true;
        // Mehrfachwerte innerhalb eines Keys -> OR
        return values.some((value) => this.matches(book, key, value));
      }),
    );
  }

  private matches(book: Book, key: string, value: string): boolean {
    const record = book as unknown as Record<string, unknown>;
    const opMatch = OPERATOR_RE.exec(key);

    if (opMatch) {
      const [, field, op] = opMatch;
      const fieldValue = record[field];

      if (op === 'gte' || op === 'lte') {
        if (isNumeric(fieldValue) && isNumeric(value)) {
          const a = Number(fieldValue);
          const b = Number(value);
          return op === 'gte' ? a >= b : a <= b;
        }
        const a = String(fieldValue);
        const b = String(value);
        return op === 'gte' ? a >= b : a <= b;
      }

      if (op === 'ne') {
        return String(fieldValue) !== value;
      }

      // _like
      try {
        return new RegExp(value, 'i').test(String(fieldValue));
      } catch {
        return String(fieldValue).toLowerCase().includes(value.toLowerCase());
      }
    }

    // exakter Vergleich mit Zahl-Coercion
    const fieldValue = record[key];
    if (typeof fieldValue === 'number' && isNumeric(value)) {
      return fieldValue === Number(value);
    }
    return String(fieldValue) === value;
  }

  private applySort(items: Book[], raw: RawQuery): Book[] {
    if (raw._sort === undefined) return items;
    const fields = String(raw._sort)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (fields.length === 0) return items;

    const orders = String(raw._order ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase());

    const decorated = items.map((item, index) => ({ item, index }));
    decorated.sort((a, b) => {
      for (let i = 0; i < fields.length; i++) {
        const field = fields[i];
        const dir = orders[i] === 'desc' ? -1 : 1;
        const av = (a.item as unknown as Record<string, unknown>)[field];
        const bv = (b.item as unknown as Record<string, unknown>)[field];
        const cmp = this.compare(av, bv);
        if (cmp !== 0) return cmp * dir;
      }
      return a.index - b.index; // stabil
    });
    return decorated.map((d) => d.item);
  }

  private compare(a: unknown, b: unknown): number {
    if (a === b) return 0;
    if (a === undefined || a === null) return -1;
    if (b === undefined || b === null) return 1;
    if (isNumeric(a) && isNumeric(b)) {
      return Number(a) - Number(b);
    }
    return String(a).localeCompare(String(b));
  }

  private applyPagination(
    items: Book[],
    raw: RawQuery,
    res: Response,
    total: number,
  ): Book[] {
    const has = (key: string): boolean => raw[key] !== undefined;

    if (has('_page')) {
      const limit = Number(raw._limit ?? 10);
      const page = Math.max(1, Number(raw._page));
      const start = (page - 1) * limit;
      res.setHeader('X-Total-Count', String(total));
      this.setLinkHeader(res, page, limit, total);
      return items.slice(start, start + limit);
    }

    if (has('_start') || has('_end') || has('_limit')) {
      const start = Number(raw._start ?? 0);
      const end =
        raw._end !== undefined
          ? Number(raw._end)
          : raw._limit !== undefined
            ? start + Number(raw._limit)
            : undefined;
      res.setHeader('X-Total-Count', String(total));
      return items.slice(start, end);
    }

    return items;
  }

  private setLinkHeader(
    res: Response,
    page: number,
    limit: number,
    total: number,
  ): void {
    const originalUrl = res.req?.originalUrl ?? '/books';
    const [path, search = ''] = originalUrl.split('?');
    const lastPage = Math.max(1, Math.ceil(total / limit));

    const buildUrl = (target: number): string => {
      const params = new URLSearchParams(search);
      params.set('_page', String(target));
      return `${path}?${params.toString()}`;
    };

    const parts: string[] = [];
    parts.push(`<${buildUrl(1)}>; rel="first"`);
    if (page > 1) parts.push(`<${buildUrl(page - 1)}>; rel="prev"`);
    if (page < lastPage) parts.push(`<${buildUrl(page + 1)}>; rel="next"`);
    parts.push(`<${buildUrl(lastPage)}>; rel="last"`);

    res.setHeader('Link', parts.join(', '));
  }
}
