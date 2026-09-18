# Changelog

## 4.2.0

### Breaking

- **Package is now pure ESM** (`"type": "module"` in `package.json`). Internal
  imports use `.js`-suffixed paths and `tsconfig.json` targets `ES2023` with
  `nodenext` module resolution. Anything `require()`-ing `bookmonkey-api` or its
  internals from CommonJS needs to switch to `import`.
- **`createdAt` / `updatedAt` are now required, server-managed fields on every
  book.** They're set on `POST` and refreshed on `PUT` / `PATCH`; any
  `createdAt` / `updatedAt` sent by the client is ignored. Every book response
  now carries two additional fields that weren't there before.
- `book.price` is of type number

### Added

- **`GET /books/:isbn/exists`** – lightweight existence check, responds with
  `{ isbn, exists }`. Registered ahead of `GET /books/:isbn` so `exists` isn't
  swallowed as an ISBN.
- **`predecessorIsbn` / `successorIsbn`** on the book schema: the ISBN of the
  previous / next volume in the same series, or `null` for standalone titles and
  at the ends of a series. Follow them with `GET /books/:isbn`. The fields are
  accepted on `POST` / `PUT` / `PATCH` and appear in the OpenAPI schema.
- **`?_devError=true`** on every `/books` endpoint (`GET /books`,
  `GET /books/:isbn`, `GET /books/:isbn/exists`, `POST`, `PUT`, `PATCH`,
  `DELETE`) forces a `400` response, for practicing client-side error handling
  in workshops.

### Infrastructure

- **Test suite migrated from Jest to Vitest** (`vitest.config.ts` /
  `vitest.config.e2e.ts`), replacing `jest.config.js` / `test/jest-e2e.json`.
  `npm test` / `npm run test:e2e` now run under Vitest; added `test:watch` and
  `test:cov` scripts.
- **Linting switched from ESLint to oxlint** (`oxlint.json`); `eslint.config.mjs`
  and its dependencies are gone.

### Changed

- **Seed data replaced.** The 250 technical books are gone; the shipped seed now
  holds **50 well-known fiction and non-fiction titles** – Harry Potter, The Lord
  of the Rings, The Hunger Games, The Wheel of Time, A Song of Ice and Fire,
  Mistborn, His Dark Materials and more, plus standalones such as _The Willpower
  Instinct_ and _How to Win Friends and Influence People_. All cover images under
  `covers/<isbn>.png` were swapped accordingly. Seed prices are now `currency:
"EUR"`.

### Fixed

- **`POST /dev/reset`'s Swagger summary** is now in English (previously it was
  German-only).

## 4.0.0 — Breaking Changes

Complete rewrite from a `json-server` script to a **NestJS 12** application. The
HTTP surface is kept as close as possible; the differences below are intentional.

### Breaking

- **`id` is now a server-generated GUID** (`crypto.randomUUID()`), previously it
  was identical to `isbn`. Detail routes stay addressed by `:isbn`
  (`GET/PUT/PATCH/DELETE /books/:isbn`).
- **`price` is a `number`** (previously the string `"$34.99"`). A new field
  **`currency`** (string enum `EUR | USD | GBP | CNY | RUB`, default `EUR`) was
  added. Seed books are migrated to `price: <number>` + `currency: "USD"`.
- **The octal guard prefix routes (`/660/...`, `/640/...`, …) were removed.**
  They were dead code in the original server (the rewriter that would have
  mapped resources onto those prefixes was never invoked), so in practice
  **no endpoint required authentication** — and that stays the case. `/books`
  CRUD and `/users/:id` updates remain fully public. `POST /register` /
  `POST /login` still issue a JWT for workshop practice, but nothing enforces it.
- **The HTML documentation page was removed.** The API is now documented with
  Swagger UI at `/api` (OpenAPI JSON at `/api-json`). `covers/<isbn>.png` is
  still served.
- Validation is now **Zod 4** based. The error body shape is unchanged
  (`{ errors: { <field>: { msg, param, location } } }`), but the messages are
  Zod's English defaults instead of the former hard-coded German strings.
- `PATCH /books/:isbn` is now validated too (previously unchecked).
- The auto-REST endpoints `GET /users` and `GET /users/:id` were removed (they
  exposed password hashes). Use `POST /login` for the current user, and
  `GET /users/:id/books` for a user's books.

### Fixed

- **`POST /register` now returns a real `accessToken`.** The legacy code
  destructured `{ accessToken }` from a promise that resolved `{ idToken }`, so
  the register response always contained `accessToken: undefined`.

### Unchanged

- Auth semantics beyond the bugfix: JWT secret, `1h` expiry, bcrypt salt length
  `10`, and the exact error wording (`Incorrect password`, `Cannot find user`,
  `Email already exists`, …). Auth errors are still sent as a bare JSON string.
- The full documented json-server query surface for `GET /books`
  (`_page`/`_limit`, `_sort`/`_order`, `_start`/`_end`, `_gte`/`_lte`/`_ne`/`_like`,
  `q`, exact field filters, `X-Total-Count`, `Link`, `GET /users/:id/books`).
- Persistence is still a single JSON file; `DB_PATH` override still works.

### Not supported

- The json-server query extras `_embed` and `_expand`.
- Resetting the database via a CLI flag — use `POST /dev/reset` instead.
