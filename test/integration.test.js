const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const request = require('supertest')

const { createServer } = require('../server.js')

// A book that is guaranteed to exist in the seed data (db.json).
const KNOWN_ISBN = '1001606140805'
const KNOWN_TITLE = 'Java Web Scraping Handbook'

let app
let tmpDir

before(() => {
  // Work on a throw-away copy of the database so the tests can mutate it
  // without touching the file that ships with the package.
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bookmonkey-api-'))
  const tmpDb = path.join(tmpDir, 'db.json')
  fs.copyFileSync(path.join(__dirname, '..', 'db.json'), tmpDb)
  app = createServer(tmpDb)
})

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

test('creates a book', async () => {
  const payload = {
    isbn: 'test-create-0001',
    title: 'Integration Test: Create',
    publishedAt: '2022-01-15',
    coAuthors: ['Ada Lovelace', 'Grace Hopper'],
  }

  const res = await request(app)
    .post('/books')
    .send(payload)
    .expect(201)

  assert.equal(res.body.id, payload.isbn)
  assert.equal(res.body.isbn, payload.isbn)
  assert.equal(res.body.title, payload.title)
  assert.equal(res.body.publishedAt, payload.publishedAt)
  assert.deepEqual(res.body.coAuthors, payload.coAuthors)
})

test('gets a single book by known isbn', async () => {
  const res = await request(app)
    .get(`/books/${KNOWN_ISBN}`)
    .expect(200)

  assert.equal(res.body.isbn, KNOWN_ISBN)
  assert.equal(res.body.id, KNOWN_ISBN)
  assert.equal(res.body.title, KNOWN_TITLE)
  // downward-compatible fields are always present on seeded books
  assert.ok('publishedAt' in res.body)
  assert.ok(Array.isArray(res.body.coAuthors))
})

test('gets paginated books with query', async () => {
  const res = await request(app)
    .get('/books')
    .query({ _page: 2, _limit: 5 })
    .expect(200)

  assert.ok(Array.isArray(res.body))
  assert.equal(res.body.length, 5)
  // json-server exposes the full collection size via this header
  assert.ok(Number(res.headers['x-total-count']) > 5)
})

test('updates a book with additional coAuthors', async () => {
  const isbn = 'test-update-coauthors-0001'

  await request(app)
    .post('/books')
    .send({ isbn, title: 'Integration Test: coAuthors', coAuthors: ['First Author'] })
    .expect(201)

  const { body: book } = await request(app).get(`/books/${isbn}`).expect(200)

  const res = await request(app)
    .put(`/books/${isbn}`)
    .send({ ...book, coAuthors: [...book.coAuthors, 'Second Author'] })
    .expect(200)

  assert.deepEqual(res.body.coAuthors, ['First Author', 'Second Author'])

  // persisted?
  const { body: reloaded } = await request(app).get(`/books/${isbn}`).expect(200)
  assert.deepEqual(reloaded.coAuthors, ['First Author', 'Second Author'])
})

test('updates a book with another publishedAt date', async () => {
  const isbn = 'test-update-publishedat-0001'

  await request(app)
    .post('/books')
    .send({ isbn, title: 'Integration Test: publishedAt', publishedAt: '2001-01-01' })
    .expect(201)

  const { body: book } = await request(app).get(`/books/${isbn}`).expect(200)

  const res = await request(app)
    .put(`/books/${isbn}`)
    .send({ ...book, publishedAt: '2024-11-30' })
    .expect(200)

  assert.equal(res.body.publishedAt, '2024-11-30')

  const { body: reloaded } = await request(app).get(`/books/${isbn}`).expect(200)
  assert.equal(reloaded.publishedAt, '2024-11-30')
})
