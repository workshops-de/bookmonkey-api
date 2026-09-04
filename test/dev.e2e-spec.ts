import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  KNOWN_ISBN,
  bootstrapTestApp,
  setupTmpDb,
  type TmpDb,
} from './helpers';

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

describe('DevController (e2e)', () => {
  it('POST /dev/reset restores the shipped seed', async () => {
    await request(app.getHttpServer())
      .post('/books')
      .send({ isbn: 'temp-xyz', title: 'temporary' })
      .expect(201);

    const reset = await request(app.getHttpServer())
      .post('/dev/reset')
      .expect(200);
    expect(reset.body).toEqual({ ok: true });

    await request(app.getHttpServer()).get('/books/temp-xyz').expect(404);
    await request(app.getHttpServer()).get(`/books/${KNOWN_ISBN}`).expect(200);

    const all = await request(app.getHttpServer())
      .get('/books')
      .query({ _page: 1, _limit: 1000 })
      .expect(200);
    expect(all.body).toHaveLength(250);
  });

  it('exposes swagger UI and JSON', async () => {
    const json = await request(app.getHttpServer())
      .get('/api-json')
      .expect(200);
    expect(json.headers['content-type']).toContain('application/json');
    expect(Object.keys(json.body.paths)).toEqual(
      expect.arrayContaining([
        '/books',
        '/books/{isbn}',
        '/dev/reset',
        '/login',
      ]),
    );

    const ui = await request(app.getHttpServer()).get('/api').expect(200);
    expect(ui.headers['content-type']).toContain('text/html');
  });
});
