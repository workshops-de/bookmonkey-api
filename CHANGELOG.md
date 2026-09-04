# Changelog

## 4.0.0 — Breaking Changes

Complete rewrite from a `json-server` script to a **NestJS 12** application. The
HTTP surface is kept as close as possible; the differences below are intentional.

### Breaking

* **`id` is now a server-generated GUID** (`crypto.randomUUID()`), previously it
  was identical to `isbn`. Detail routes stay addressed by `:isbn`
  (`GET/PUT/PATCH/DELETE /books/:isbn`).
* **`price` is a `number`** (previously the string `"$34.99"`). A new field
  **`currency`** (string enum `EUR | USD | GBP | CNY | RUB`, default `EUR`) was
  added. Seed books are migrated to `price: <number>` + `currency: "USD"`.
* **The octal guard prefix routes (`/660/...`, `/640/...`, …) were removed.**
  They were dead code in the original server (the rewriter that would have
  mapped resources onto those prefixes was never invoked), so in practice
  **no endpoint required authentication** — and that stays the case. `/books`
  CRUD and `/users/:id` updates remain fully public. `POST /register` /
  `POST /login` still issue a JWT for workshop practice, but nothing enforces it.
* **The HTML documentation page was removed.** The API is now documented with
  Swagger UI at `/api` (OpenAPI JSON at `/api-json`). `covers/<isbn>.png` is
  still served.
* Validation is now **Zod 4** based. The error body shape is unchanged
  (`{ errors: { <field>: { msg, param, location } } }`), but the messages are
  Zod's English defaults instead of the former hard-coded German strings.
* `PATCH /books/:isbn` is now validated too (previously unchecked).
* The auto-REST endpoints `GET /users` and `GET /users/:id` were removed (they
  exposed password hashes). Use `POST /login` for the current user, and
  `GET /users/:id/books` for a user's books.

### Fixed

* **`POST /register` now returns a real `accessToken`.** The legacy code
  destructured `{ accessToken }` from a promise that resolved `{ idToken }`, so
  the register response always contained `accessToken: undefined`.

### Unchanged

* Auth semantics beyond the bugfix: JWT secret, `1h` expiry, bcrypt salt length
  `10`, and the exact error wording (`Incorrect password`, `Cannot find user`,
  `Email already exists`, …). Auth errors are still sent as a bare JSON string.
* The full documented json-server query surface for `GET /books`
  (`_page`/`_limit`, `_sort`/`_order`, `_start`/`_end`, `_gte`/`_lte`/`_ne`/`_like`,
  `q`, exact field filters, `X-Total-Count`, `Link`, `GET /users/:id/books`).
* Persistence is still a single JSON file; `DB_PATH` override still works.

### Not supported

* The json-server query extras `_embed` and `_expand`.
* Resetting the database via a CLI flag — use `POST /dev/reset` instead.
