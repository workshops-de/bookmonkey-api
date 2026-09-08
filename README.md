<p align="center">
  <img src="logo.png" alt="boomonkey-logo" width="350px"/>
</p>

# bookmonkey-api

The bookmonkey-api is a demo api to list, get, create, update and delete books.
It's very handy for [workshops](https://workshops.de). Since **4.0.0** it is built
with [NestJS 12](https://nestjs.com) and ships an OpenAPI/Swagger documentation.

## Installation & Usage

- Run `npm install -g bookmonkey-api`.
- Start the api server with `bookmonkey-api` (optionally `bookmonkey-api --port 4730`).
- Open the interactive documentation on `http://localhost:4730/api`
  (OpenAPI JSON: `http://localhost:4730/api-json`).

The database is a plain JSON file. It lives next to the installed package
(`dist/db.json`) and can be relocated with the `DB_PATH` environment variable.

## Supported actions

    GET     /books               // Get all books (json-server style queries, see below)
    GET     /books/:isbn         // Get a specific book by ISBN
    GET     /books/:isbn/exists  // Check whether a book with a certain isbn does exist
    POST    /books               // Create a new book
    PUT     /books/:isbn         // Replace a book by ISBN
    PATCH   /books/:isbn         // Update a book by ISBN
    DELETE  /books/:isbn         // Delete a book by ISBN
    GET     /users/:id/books

    POST    /register | /signup | /users   // { email, password } -> { accessToken, user }
    POST    /login    | /signin            // { email, password } -> { accessToken, user }
    PUT     /users/:id                     // update a user (rehashes password)
    PATCH   /users/:id                     // update a user (rehashes password)

    POST    /dev/reset      // Reset the database to the shipped seed -> { ok: true }

### Auth

All endpoints are **public** — no endpoint requires a token, just like the
original server (whose octal guard system was never wired up). `POST /register`
and `POST /login` still hand out a JWT so workshops can practise sending an
`Authorization: Bearer <token>` header, but nothing enforces it.

Demo user (part of the seed): `admin@bookmonkey.api` / `password1!`.

### Book shape (4.1.0)

- `id` is a **server-generated GUID** and is no longer identical to `isbn`.
  Detail routes stay addressed by `:isbn`.
- `price` is a **number** (previously the string `"$34.99"`).
- `currency` is a string enum `EUR | USD | GBP | CNY | RUB`, default `EUR`.
  Seed books use `USD`.
- `createdAt` / `updatedAt` are **server-managed** ISO-8601 timestamps, always
  present, and cannot be supplied by the client. `createdAt` is set once on
  `POST`; `updatedAt` is set to the same value on `POST` and refreshed on every
  `PUT` / `PATCH`. Seed books carry synthetic timestamps. Use them with `_sort`
  to page newest-first (`?_sort=createdAt&_order=desc`).

### Query parameters for `GET /books`

`_page`, `_limit` (default 10), `_sort`, `_order`, `_start`, `_end`, `q` (full text),
exact field filters (`?author=Kevin Sahin`), and the operators `_gte`, `_lte`,
`_ne`, `_like`. Sort by `createdAt` / `updatedAt` to control paging order
(`?_sort=createdAt&_order=desc` = newest first). `X-Total-Count` and a RFC-5988
`Link` header are set when paging.
The json-server extras `_embed` / `_expand` are **not** supported.

See [docs/querying.md](docs/querying.md) for worked examples of pagination,
sorting, full-text search, field filters and operators (including `curl`/`jq`
recipes).

## Development

    npm install
    npm run start:dev      # watch mode
    npm test               # unit tests (Jest)
    npm run test:e2e       # end-to-end tests (Jest + supertest)
    npm run build          # nest build -> dist/

## Credits

This project exists, thanks to all the people who contribute.

<a href="https://github.com/workshops-de/bookmonkey-api/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=workshops-de/bookmonkey-api" />
</a><br/><br/>

Additionally we would like to give credits to https://github.com/Farxa for creating the bookmonkey logo.
