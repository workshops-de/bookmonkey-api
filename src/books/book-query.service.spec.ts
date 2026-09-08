import type { Response } from 'express';
import { BookQueryService } from './book-query.service.js';
import type { Book } from '../domain/index.js';

const makeBook = (over: Partial<Book>): Book =>
  ({
    id: '00000000-0000-4000-8000-000000000000',
    isbn: '1',
    title: 'T',
    currency: 'EUR',
    coAuthors: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...over,
  }) as Book;

interface FakeRes {
  headers: Record<string, string>;
  setHeader: (k: string, v: string) => void;
  req: { originalUrl: string };
}

const makeRes = (originalUrl = '/books'): FakeRes & Response => {
  const headers: Record<string, string> = {};
  return {
    headers,
    setHeader: (k: string, v: string) => {
      headers[k.toLowerCase()] = v;
    },
    req: { originalUrl },
  } as unknown as FakeRes & Response;
};

describe('BookQueryService', () => {
  const svc = new BookQueryService();

  const books: Book[] = [
    makeBook({ isbn: 'a', title: 'Angular', author: 'Max', numPages: 100, price: 10 }),
    makeBook({ isbn: 'b', title: 'React basics', author: 'Erika', numPages: 200, price: 20 }),
    makeBook({ isbn: 'c', title: 'Vue deep dive', author: 'Max', numPages: 300, price: 30 }),
    makeBook({ isbn: 'd', title: 'Node', author: 'John', numPages: 115, price: 40 }),
  ];

  it('full text search q scans all fields', () => {
    const res = makeRes();
    const out = svc.apply(books, { q: 'basics' }, res);
    expect(out.map((b) => b.isbn)).toEqual(['b']);
  });

  it('exact field filter with number coercion', () => {
    const res = makeRes();
    const out = svc.apply(books, { numPages: '115' }, res);
    expect(out.map((b) => b.isbn)).toEqual(['d']);
  });

  it('exact field filter on strings', () => {
    const res = makeRes();
    const out = svc.apply(books, { author: 'Max' }, res);
    expect(out.map((b) => b.isbn)).toEqual(['a', 'c']);
  });

  it('multi-value key is OR', () => {
    const res = makeRes();
    const out = svc.apply(books, { isbn: ['a', 'c'] }, res);
    expect(out.map((b) => b.isbn)).toEqual(['a', 'c']);
  });

  it('_gte / _lte numeric', () => {
    const res = makeRes();
    const out = svc.apply(books, { numPages_gte: '200', numPages_lte: '300' }, res);
    expect(out.map((b) => b.isbn)).toEqual(['b', 'c']);
  });

  it('_ne', () => {
    const res = makeRes();
    const out = svc.apply(books, { author_ne: 'Max' }, res);
    expect(out.map((b) => b.isbn)).toEqual(['b', 'd']);
  });

  it('_like is a case-insensitive regex', () => {
    const res = makeRes();
    const out = svc.apply(books, { title_like: '^v' }, res);
    expect(out.map((b) => b.isbn)).toEqual(['c']);
  });

  it('multi-key sort with _order', () => {
    const res = makeRes();
    const out = svc.apply(books, { _sort: 'author,numPages', _order: 'asc,desc' }, res);
    expect(out.map((b) => b.author)).toEqual(['Erika', 'John', 'Max', 'Max']);
    // within Max: numPages desc -> 300 (c) before 100 (a)
    expect(out.filter((b) => b.author === 'Max').map((b) => b.isbn)).toEqual([
      'c',
      'a',
    ]);
  });

  it('_page paginates, sets X-Total-Count and a Link header', () => {
    const many = Array.from({ length: 23 }, (_, i) =>
      makeBook({ isbn: String(i), title: `t${i}` }),
    );
    const res = makeRes('/books?_page=2&_limit=5');
    const out = svc.apply(many, { _page: '2', _limit: '5' }, res);
    expect(out).toHaveLength(5);
    expect(res.headers['x-total-count']).toBe('23');
    expect(res.headers['link']).toContain('rel="first"');
    expect(res.headers['link']).toContain('_page=3'); // next
    expect(res.headers['link']).toContain('_page=5'); // last (ceil(23/5))
    expect(res.headers['link']).toContain('rel="prev"');
  });

  it('default _limit is 10 when only _page is given', () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      makeBook({ isbn: String(i) }),
    );
    const res = makeRes('/books?_page=1');
    const out = svc.apply(many, { _page: '1' }, res);
    expect(out).toHaveLength(10);
    expect(res.headers['x-total-count']).toBe('25');
  });

  it('_start / _end slice and set X-Total-Count', () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      makeBook({ isbn: String(i) }),
    );
    const res = makeRes();
    const out = svc.apply(many, { _start: '2', _end: '5' }, res);
    expect(out.map((b) => b.isbn)).toEqual(['2', '3', '4']);
    expect(res.headers['x-total-count']).toBe('10');
  });

  it('no paging params -> no X-Total-Count header', () => {
    const res = makeRes();
    const out = svc.apply(books, {}, res);
    expect(out).toHaveLength(4);
    expect(res.headers['x-total-count']).toBeUndefined();
  });
});
