import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  KNOWN_ISBN,
  KNOWN_TITLE,
  bootstrapTestApp,
  isUuid,
  setupTmpDb,
  type TmpDb,
} from './helpers.js';

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

const http = () => request(app.getHttpServer());

describe('BooksController (e2e)', () => {
  it('1: creates a book (no auth required)', async () => {
    const payload = {
      isbn: 'test-create-0001',
      title: 'Integration Test: Create',
      publishedAt: '2022-01-15',
      coAuthors: ['Ada Lovelace', 'Grace Hopper'],
      price: 9.99,
    };
    const res = await http().post('/books').send(payload).expect(201);

    expect(isUuid(res.body.id)).toBe(true);
    expect(res.body.id).not.toBe(payload.isbn);
    expect(res.body.isbn).toBe(payload.isbn);
    expect(res.body.title).toBe(payload.title);
    expect(res.body.publishedAt).toBe(payload.publishedAt);
    expect(res.body.coAuthors).toEqual(payload.coAuthors);
    expect(res.body.currency).toBe('EUR');
    expect(res.body.price).toBe(9.99);
  });

  it('2: gets a single book by known isbn', async () => {
    const res = await http().get(`/books/${KNOWN_ISBN}`).expect(200);

    expect(res.body.isbn).toBe(KNOWN_ISBN);
    expect(isUuid(res.body.id)).toBe(true);
    expect(res.body.id).not.toBe(KNOWN_ISBN);
    expect(res.body.title).toBe(KNOWN_TITLE);
    expect(typeof res.body.price).toBe('number');
    expect(res.body.currency).toBe('USD');
    expect('publishedAt' in res.body).toBe(true);
    expect(Array.isArray(res.body.coAuthors)).toBe(true);
  });

  it('3: paginated books', async () => {
    const res = await http()
      .get('/books')
      .query({ _page: 2, _limit: 5 })
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(5);
    // >= 250: vorherige Tests in dieser Datei legen Bücher an (keine DB-Isolation je Test).
    expect(Number(res.headers['x-total-count'])).toBeGreaterThanOrEqual(250);
    expect(res.headers['link']).toContain('rel="next"');
  });

  it('4: PUT merges coAuthors and keeps id stable', async () => {
    const isbn = 'test-update-coauthors-0001';
    const created = await http()
      .post('/books')
      .send({ isbn, title: 'coAuthors', coAuthors: ['First Author'] })
      .expect(201);

    const { body: book } = await http().get(`/books/${isbn}`).expect(200);

    const res = await http()
      .put(`/books/${isbn}`)
      .send({ ...book, id: undefined, coAuthors: [...book.coAuthors, 'Second Author'] })
      .expect(200);

    expect(res.body.coAuthors).toEqual(['First Author', 'Second Author']);
    expect(res.body.id).toBe(created.body.id);

    const { body: reloaded } = await http().get(`/books/${isbn}`).expect(200);
    expect(reloaded.coAuthors).toEqual(['First Author', 'Second Author']);
    expect(reloaded.id).toBe(created.body.id);
  });

  it('5: PUT changes publishedAt', async () => {
    const isbn = 'test-update-publishedat-0001';
    await http()
      .post('/books')
      .send({ isbn, title: 'publishedAt', publishedAt: '2001-01-01' })
      .expect(201);

    const { body: book } = await http().get(`/books/${isbn}`).expect(200);

    const res = await http()
      .put(`/books/${isbn}`)
      .send({ ...book, id: undefined, publishedAt: '2024-11-30' })
      .expect(200);
    expect(res.body.publishedAt).toBe('2024-11-30');

    const { body: reloaded } = await http().get(`/books/${isbn}`).expect(200);
    expect(reloaded.publishedAt).toBe('2024-11-30');
  });

  it('GUID identity: id is a uuid and differs from isbn', async () => {
    const isbn = 'test-guid-0001';
    await http().post('/books').send({ isbn, title: 'guid' }).expect(201);
    const { body } = await http().get(`/books/${isbn}`).expect(200);
    expect(isUuid(body.id)).toBe(true);
    expect(body.id).not.toBe(isbn);
  });

  it('currency default & validation', async () => {
    const ok = await http()
      .post('/books')
      .send({ isbn: 'cur-1', title: 'cur' })
      .expect(201);
    expect(ok.body.currency).toBe('EUR');

    const bad = await http()
      .post('/books')
      .send({ isbn: 'cur-2', title: 'cur', currency: 'XXX' })
      .expect(400);
    expect(bad.body.errors.currency.param).toBe('currency');
    expect(bad.body.errors.currency.location).toBe('body');
    expect(typeof bad.body.errors.currency.msg).toBe('string');
  });

  it('price must be a number and non-negative', async () => {
    const asString = await http()
      .post('/books')
      .send({ isbn: 'price-1', title: 'p', price: '9.99' })
      .expect(400);
    expect(asString.body.errors.price).toBeDefined();

    const negative = await http()
      .post('/books')
      .send({ isbn: 'price-2', title: 'p', price: -1 })
      .expect(400);
    expect(negative.body.errors.price).toBeDefined();
  });

  it('required-field error shape', async () => {
    const res = await http().post('/books').send({}).expect(400);
    expect(Object.keys(res.body.errors).sort()).toEqual(['isbn', 'title']);
    expect(res.body.errors.isbn.param).toBe('isbn');
    expect(res.body.errors.isbn.location).toBe('body');
    expect(res.body.errors.title.param).toBe('title');
  });

  it('ignores a misspelled property and does not treat it as a valid field', async () => {
    const isbn = 'test-typo-authr-0001';
    const res = await http()
      .post('/books')
      .send({
        isbn,
        title: 'Typo Author',
        // "author" mit fehlendem "o" -> darf nicht als "author" durchrutschen
        authr: 'Ada Lovelace',
      })
      .expect(201);

    expect('authr' in res.body).toBe(false);
    expect('author' in res.body).toBe(false);

    const { body: reloaded } = await http().get(`/books/${isbn}`).expect(200);
    expect('authr' in reloaded).toBe(false);
    expect(reloaded.author).toBeUndefined();
  });

  it('strips unknown properties so no dead data reaches the store', async () => {
    const isbn = 'test-extra-props-0001';
    const res = await http()
      .post('/books')
      .send({
        isbn,
        title: 'Extra Props',
        bogus: 'should not be stored',
        rating: 5,
        internalNote: { secret: true },
      })
      .expect(201);

    expect('bogus' in res.body).toBe(false);
    expect('rating' in res.body).toBe(false);
    expect('internalNote' in res.body).toBe(false);

    const { body: reloaded } = await http().get(`/books/${isbn}`).expect(200);
    expect('bogus' in reloaded).toBe(false);
    expect('rating' in reloaded).toBe(false);
    expect('internalNote' in reloaded).toBe(false);
    // Nur bekannte Schema-Felder dürfen zurückkommen.
    const allowedKeys = new Set([
      'id',
      'isbn',
      'title',
      'subtitle',
      'abstract',
      'author',
      'publisher',
      'price',
      'currency',
      'numPages',
      'cover',
      'userId',
      'publishedAt',
      'coAuthors',
      'createdAt',
      'updatedAt',
    ]);
    expect(Object.keys(reloaded).every((key) => allowedKeys.has(key))).toBe(true);
  });

  it('write endpoints are public (no token needed)', async () => {
    await http()
      .post('/books')
      .send({ isbn: 'public-1', title: 'x' })
      .expect(201);
    await http().delete('/books/public-1').expect(200);
  });

  it('PATCH does not overwrite currency with the default', async () => {
    const isbn = 'patch-cur-1';
    await http()
      .post('/books')
      .send({ isbn, title: 'x', currency: 'GBP' })
      .expect(201);
    const res = await http()
      .patch(`/books/${isbn}`)
      .send({ title: 'y' })
      .expect(200);
    expect(res.body.currency).toBe('GBP');
    expect(res.body.title).toBe('y');
  });

  it('DELETE returns 200 with empty body', async () => {
    const isbn = 'del-1';
    await http().post('/books').send({ isbn, title: 'x' }).expect(201);
    const res = await http().delete(`/books/${isbn}`).expect(200);
    expect(res.body).toEqual({});
    await http().get(`/books/${isbn}`).expect(404);
  });

  it("GET /users/:id/books returns only that user's books", async () => {
    const res = await http()
      .get('/users/1/books')
      .query({ _page: 1, _limit: 1000 })
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.every((b: { userId: number }) => b.userId === 1)).toBe(true);
  });

  it('GET /books/:isbn/exists reports true for a taken isbn', async () => {
    const isbn = 'test-exists-taken-0001';
    await http().post('/books').send({ isbn, title: 'exists' }).expect(201);

    const res = await http().get(`/books/${isbn}/exists`).expect(200);
    expect(res.body).toEqual({ isbn, exists: true });
  });

  it('GET /books/:isbn/exists reports false for a free isbn', async () => {
    const res = await http()
      .get('/books/test-exists-free-does-not-exist/exists')
      .expect(200);
    expect(res.body).toEqual({
      isbn: 'test-exists-free-does-not-exist',
      exists: false,
    });
  });

  it('static cover asset is served', async () => {
    const res = await http().get('/covers/1001606140805.png').expect(200);
    expect(res.headers['content-type']).toContain('image/png');
  });

  it('POST sets server-managed createdAt / updatedAt and returns them', async () => {
    const res = await http()
      .post('/books')
      .send({ isbn: 'test-createdat-0001', title: 'Timestamps' })
      .expect(201);

    expect(typeof res.body.createdAt).toBe('string');
    expect(Number.isNaN(Date.parse(res.body.createdAt))).toBe(false);
    // Beim Anlegen sind beide Zeitstempel identisch.
    expect(res.body.updatedAt).toBe(res.body.createdAt);
  });

  it('sorts by createdAt desc so the most recently created book comes first', async () => {
    const older = await http()
      .post('/books')
      .send({ isbn: 'test-sort-createdat-older', title: 'Older' })
      .expect(201);

    // ms-Kollision vermeiden: applySort ist stabil und würde bei gleichem
    // Zeitstempel die Einfügereihenfolge (neuestes zuletzt) behalten.
    await new Promise((resolve) => setTimeout(resolve, 5));

    const newest = await http()
      .post('/books')
      .send({ isbn: 'test-sort-createdat-newest', title: 'Newest' })
      .expect(201);

    const res = await http()
      .get('/books')
      .query({ _sort: 'createdAt', _order: 'desc' })
      .expect(200);

    expect(res.body[0].id).toBe(newest.body.id);
    expect(res.body[0].isbn).toBe('test-sort-createdat-newest');
    expect(Date.parse(res.body[0].createdAt)).toBeGreaterThan(
      Date.parse(older.body.createdAt),
    );
  });

  it('PATCH bumps updatedAt but leaves createdAt untouched', async () => {
    const isbn = 'test-updatedat-patch-0001';
    const created = await http()
      .post('/books')
      .send({ isbn, title: 'before' })
      .expect(201);

    await new Promise((resolve) => setTimeout(resolve, 5));

    const patched = await http()
      .patch(`/books/${isbn}`)
      .send({ title: 'after' })
      .expect(200);

    expect(patched.body.createdAt).toBe(created.body.createdAt);
    expect(Date.parse(patched.body.updatedAt)).toBeGreaterThan(
      Date.parse(created.body.updatedAt),
    );
  });
});
