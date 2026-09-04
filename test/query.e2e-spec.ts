import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { bootstrapTestApp, setupTmpDb, type TmpDb } from './helpers.js';

let app: INestApplication;
let tmp: TmpDb;

beforeAll(async () => {
  tmp = setupTmpDb();
  app = await bootstrapTestApp();
});

afterAll(async () => {
  await app.close();
  tmp.cleanup();
});

const get = (path: string) => request(app.getHttpServer()).get(path);

describe('GET /books query pipeline (e2e)', () => {
  it('_page / _limit slice and expose headers', async () => {
    const res = await get('/books?_page=1&_limit=7').expect(200);
    expect(res.body).toHaveLength(7);
    expect(res.headers['x-total-count']).toBe('250');
    expect(res.headers['link']).toContain('rel="last"');
  });

  it('_start / _end slice without _page', async () => {
    const res = await get('/books?_start=0&_end=3').expect(200);
    expect(res.body).toHaveLength(3);
    expect(res.headers['x-total-count']).toBe('250');
  });

  it('no paging params -> no X-Total-Count, full list', async () => {
    const res = await get('/books').expect(200);
    expect(res.body).toHaveLength(250);
    expect(res.headers['x-total-count']).toBeUndefined();
  });

  it('exact field filter', async () => {
    const res = await get('/books?author=Kevin Sahin').expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(
      res.body.every((b: { author: string }) => b.author === 'Kevin Sahin'),
    ).toBe(true);
  });

  it('_like operator (case-insensitive regex)', async () => {
    const res = await get('/books?title_like=java').expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(
      res.body.every((b: { title: string }) => /java/i.test(b.title)),
    ).toBe(true);
  });

  it('_gte / _lte numeric on numPages', async () => {
    const res = await get('/books?numPages_gte=100&numPages_lte=150').expect(200);
    expect(
      res.body.every((b: { numPages: number }) => b.numPages >= 100 && b.numPages <= 150),
    ).toBe(true);
  });

  it('_sort / _order', async () => {
    const res = await get('/books?_sort=numPages&_order=desc&_limit=5&_page=1').expect(
      200,
    );
    const pages = res.body.map((b: { numPages: number }) => b.numPages);
    const sorted = [...pages].sort((a, b) => b - a);
    expect(pages).toEqual(sorted);
  });

  it('full-text q', async () => {
    const res = await get('/books?q=scraping').expect(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('GET /users/:id/books composes with the query pipeline', async () => {
    const res = await get('/users/1/books?_page=1&_limit=4').expect(200);
    expect(res.body).toHaveLength(4);
    expect(res.headers['x-total-count']).toBe('250');
  });
});
