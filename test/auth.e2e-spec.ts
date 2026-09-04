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

describe('AuthController (e2e)', () => {
  const creds = { email: 'auth-e2e@bookmonkey.api', password: 'secret1' };

  it('register returns a real accessToken (bugfix) and a hashed user', async () => {
    const res = await request(app.getHttpServer())
      .post('/register')
      .send(creds)
      .expect(201);

    expect(typeof res.body.accessToken).toBe('string');
    expect(res.body.accessToken.split('.')).toHaveLength(3);
    expect(res.body.user.email).toBe(creds.email);
    expect(res.body.user.password).toMatch(/^\$2[aby]\$/);
  });

  it('register rejects a duplicate email with a blank string body', async () => {
    const res = await request(app.getHttpServer())
      .post('/register')
      .send(creds)
      .expect(400);
    expect(res.body).toBe('Email already exists');
  });

  it('register validates email format and password length', async () => {
    await request(app.getHttpServer())
      .post('/register')
      .send({ email: 'nope', password: 'secret1' })
      .expect(400)
      .expect('"Email format is invalid"');
    await request(app.getHttpServer())
      .post('/register')
      .send({ email: 'x@y.de', password: 'a' })
      .expect(400)
      .expect('"Password is too short"');
    await request(app.getHttpServer())
      .post('/register')
      .send({})
      .expect(400)
      .expect('"Email and password are required"');
  });

  it('login succeeds and fails with the historic bare-string errors', async () => {
    const ok = await request(app.getHttpServer())
      .post('/login')
      .send(creds)
      .expect(200);
    expect(typeof ok.body.accessToken).toBe('string');
    expect(ok.body.user.email).toBe(creds.email);

    const wrongPw = await request(app.getHttpServer())
      .post('/login')
      .send({ ...creds, password: 'wrong' })
      .expect(400);
    expect(wrongPw.body).toBe('Incorrect password');

    const noUser = await request(app.getHttpServer())
      .post('/login')
      .send({ email: 'ghost@bookmonkey.api', password: 'secret1' })
      .expect(400);
    expect(noUser.body).toBe('Cannot find user');
  });

  it('the seed demo user logs in with the documented password', async () => {
    const res = await request(app.getHttpServer())
      .post('/login')
      .send({ email: 'admin@bookmonkey.api', password: 'password1!' })
      .expect(200);
    expect(res.body.user.id).toBe(1);
  });

  it('signup / signin aliases work', async () => {
    await request(app.getHttpServer())
      .post('/signup')
      .send({ email: 'alias@bookmonkey.api', password: 'secret1' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/signin')
      .send({ email: 'alias@bookmonkey.api', password: 'secret1' })
      .expect(200);
  });

  it('PATCH /users/:id rehashes the password (no token required)', async () => {
    const reg = await request(app.getHttpServer())
      .post('/register')
      .send({ email: 'owner@bookmonkey.api', password: 'secret1' })
      .expect(201);
    const { user } = reg.body;

    const res = await request(app.getHttpServer())
      .patch(`/users/${user.id}`)
      .send({ password: 'brandnew', nickname: 'ok' })
      .expect(200);
    expect(res.body.password).toMatch(/^\$2[aby]\$/);
    expect(res.body.password).not.toBe('brandnew');
    expect(res.body.nickname).toBe('ok');

    await request(app.getHttpServer())
      .patch(`/users/${user.id + 999}`)
      .send({ nickname: 'x' })
      .expect(404);
  });
});
