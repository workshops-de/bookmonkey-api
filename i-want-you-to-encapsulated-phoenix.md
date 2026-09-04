# Spezifikation: Migration `bookmonkey-api` → NestJS 12 (Single-Repo, kein Nx)

> Dieses Dokument ist die vollständige Vorgabe für die Umsetzung. Ein Umsetzungs-Agent soll
> es in einem frischen Kontext lesen können, ohne den ursprünglichen Chat zu kennen.
> Reihenfolge der Umsetzung: Abschnitt 15 (Phasenplan).

---

## 1. Ausgangslage (Ist-Zustand des Repos)

Repo: `/Users/gregor/workbench/trainings/bookmonkey-api`, aktueller Branch `main`
(Default-Branch für PRs ist `master`). Veröffentlicht als npm-Paket `bookmonkey-api`
(aktuell `3.3.0`), Nutzung: `npm install -g bookmonkey-api` → `bookmonkey-api` startet den
Server auf Port **4730**; Doku unter `http://localhost:4730/`.

**Technik heute:** reines CommonJS, **kein** TypeScript, **kein** Build-Schritt.
`package.json` `bin` = `server.js` (mit `#!/usr/bin/env node`). `engines.node >=22.12.0`,
`.nvmrc` = `26`. Lokal installiert: Node `v26.1.0`, npm `11.13.0`.

**Laufzeit:** `server.js` `createServer()` baut einen `json-server` 0.17.4 (Express
darunter). Middleware-Reihenfolge in `createServer`:

1. `jsonServer.defaults({ static: public/ })` – morgan `dev`-Logging, permissives CORS,
   Static-Server für `public/`, `compression`, `no-cache`-Helfer.
2. `[users.router, guards.router]` (Array; nicht-enumerable Property `rewriter` drangehängt,
   aber **nirgends aufgerufen**).
3. `bookValidation.middleware`.
4. `jsonServer.router(dbPath)` – Auto-REST über `db.json`.

Nur bei direktem Start (`require.main === module`) wird `banner.txt` ausgegeben und
`server.listen(process.env.PORT || 4730)`. `createServer` ist exportiert, damit Tests den
echten Stack in-process fahren. `dbPath` = `process.env.DB_PATH || path.join(__dirname,
'db.json')`.

**Endpunkte heute:**

| Route | Quelle | Verhalten |
|---|---|---|
| `GET /books` | json-server | Liste; Query: `_page`, `_limit` (Default 10), `_sort`, `_order`, `_start`/`_end`, `_gte`/`_lte`/`_ne`/`_like`, `q` (Volltext), exakte Feld-Filter. Header `X-Total-Count`, `Link`. |
| `GET /books/:id` | json-server | Einzelbuch; Schlüssel = `id`, und `id === isbn` (s. u.). 404 wenn nicht vorhanden. |
| `POST /books` | book-validation → json-server | Validierung, dann `req.body.id = req.body.isbn`, dann Insert. `201`. |
| `PUT /books/:id` | book-validation → json-server | Vollersatz, `200`. |
| `PATCH /books/:id` | json-server (KEINE Validierung) | Teil-Update, `200`. |
| `DELETE /books/:id` | json-server | `200`, Body `{}`. |
| `GET /users`, `GET /users/:id` | json-server | Auto-REST. |
| `GET /users/:id/books` | json-server | verschachtelt: Bücher mit passender `userId`. |
| `POST /users` \| `/register` \| `/signup` | `users.js` | E-Mail/Passwort validieren (Regex + Mindestlänge 4), Duplikat-Mail → `400 "Email already exists"`, bcrypt-Hash (Salt 10), Insert in `users`, JWT signieren (`subject`=User-id, Claim `email`, `expiresIn` `1h`), **Antwort `201 { accessToken, user }`**. |
| `POST /[640]{3}/users` | `users.js` | wie oben (sollte Guards umgehen). |
| `POST /login` \| `/signin` | `users.js` | User per Mail suchen (`400 "Cannot find user"`), `bcrypt.compare` (`400 "Incorrect password"`), JWT, `200 { accessToken, user }`. |
| `PUT /users/:id` | `users.js` → json-server | bei `password` im Body neu hashen, dann `next()`. |
| `PATCH /users/:id` | `users.js` → json-server | wie oben, `required:false`. |
| `/…` (octal prefixes) | `middlewares/guards.js` | `/666 /664 /660 /644 /640 /600 /444 /440 /400` + `/*`: `loggedOnly`/`privateOnly`/`readOnly`-Kombis, danach `flattenUrl` entfernt das `/NNN`-Segment. |
| `GET /` und statische Assets | json-server static | `public/index.html` (Doku-Seite), `public/covers/<isbn>.png` (250 PNGs), `bootstrap.min.css`, `highlight.*`. |

**Bekannte Bugs / Auffälligkeiten (im Ist-Code):**

- `users.js` `create`: die Promise resolved `{ idToken, user }`, destrukturiert wird aber
  `{ accessToken, user }` → **die Register-Antwort enthält `accessToken: undefined`**.
  `login` ist korrekt. → In der Migration fixen.
- `guards.js` `rewriter`/`parseGuardsRules` werden nie verdrahtet (halbtote Funktion).
- `flattenUrl`-Regex `/\/[640]{3}/` matcht jede 3er-Folge aus `6/4/0` (z. B. `/000/`),
  nicht nur die 8 dokumentierten Prefixe.
- `privateOnly` auf Kollektionen nutzt `Array.some()` und ist laut eigenem TODO „not
  properly secured".
- Auth-Fehler werden per `res.status(400).jsonp('...')` gesendet → Body ist ein **blanker
  JSON-String**, kein Objekt.
- `bookValidation` greift nur bei `req.path.includes('books') && method in [POST, PUT]` –
  PATCH/DELETE ungeprüft.

**Daten:**

- Arbeits-DB `db.json` (im Repo, 250 Bücher, **2** User `admin@bookmonkey.api` id 1 +
  `admin2@bookmonkey.api` id 2). lowdb schreibt Mutationen zurück auf Platte.
- Seed `db-original.json` (im Repo, 250 Bücher, **1** User `admin@bookmonkey.api` id 1,
  bcrypt-Hash `$2a$10$Evsbmwpt5JIsDb3hSRklq.u7zapUWPCNPl8EFE1igm9B1bqroGfSq`). Wird zur
  Laufzeit **nirgends** gelesen; nur `getBooks.js` schreibt ihn. **Dies ist der maßgebliche
  Seed für die Migration.**
- **Ein Buch (Ist-Form)** – verifiziert aus `db-original.json`:
  ```json
  {
    "id": "1001606140805", "title": "Java Web Scraping Handbook",
    "subtitle": "Learn advanced Web Scraping techniques", "isbn": "1001606140805",
    "abstract": "Web scraping or crawling is the art of …", "author": "Kevin Sahin",
    "publisher": "Leanpub", "price": "$0.00", "numPages": 115,
    "cover": "http://localhost:4730/covers/1001606140805.png",
    "userId": 1, "publishedAt": "2006-11-30", "coAuthors": []
  }
  ```
- Verifiziert über alle 250 Seed-Bücher: `id === isbn` immer; `price` **immer** im Format
  `"$<zahl>.<2 stellen>"` (160 verschiedene Werte, keine Ausnahme, alle Dollar);
  `publishedAt` immer ein `YYYY-MM-DD`-String (nie `null`); `coAuthors` immer ein Array
  (durchweg `[]`); `userId` immer `1`.
- `cover`-URL ist hart auf `http://localhost:4730/covers/<isbn>.png` verdrahtet.

**Tests heute:** `node --test test/*.test.js` + `supertest`, 5 Integrationsszenarien gegen
`createServer(tmpDbCopy)`. Konstanten `KNOWN_ISBN = '1001606140805'`, `KNOWN_TITLE = 'Java
Web Scraping Handbook'`. Szenarien: (1) `POST /books` → 201, prüft u. a. `res.body.id ===
isbn`; (2) `GET /books/<KNOWN_ISBN>` → prüft `res.body.id === KNOWN_ISBN`; (3) `GET
/books?_page=2&_limit=5` → Länge 5, `x-total-count > 5`; (4) `POST` dann `PUT` mit
zusätzlichen `coAuthors` → persistiert; (5) `POST` dann `PUT` mit anderem `publishedAt` →
persistiert.

**CI:** `.github/workflows/ci.yml` (`push`/`pull_request` auf `main`: checkout@v5,
setup-node@v5 mit `node-version-file: .nvmrc`, `npm ci`, `npm test`).
`.github/workflows/release-to-npm.yml` (`release: [created]`: Build-Job `npm ci`+`npm test`;
Publish-Job `npm ci`+`npm publish` mit `NODE_AUTH_TOKEN: ${{ secrets.npm_token }}`).

**`package.json` `files`:** `server.js`, `users.js`, `getBooks.js`, `constants.js`,
`db.json`, `db-original.json`, `banner.txt`, `middlewares/`, `public/`, `vendor/`.
`vendor/` enthält nur `buffer-equal-constant-time/` (transitive Alt-Abhängigkeit, entfällt).

**`constants.js` (Werte müssen 1:1 erhalten bleiben):**

```
JWT_SECRET_KEY      = 'json-server-auth-123456'
JWT_EXPIRES_IN      = '1h'
SALT_LENGTH         = 10
MIN_PASSWORD_LENGTH = 4
EMAIL_REGEX         = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
```

---

## 2. Ziel & Leitplanken

Einzelnes **NestJS-12-Repo** (kein Nx – es gibt nur diese eine Anwendung). Nutzung
**unverändert**: `npx bookmonkey-api` bzw. globale Installation startet den HTTP-Server auf
Port 4730 mit denselben Endpunkten. Sauber in NestJS-Module/Controller/Services gegliedert.
Schema-first mit **Zod 4**: ein `bookSchema` als Quelle der Wahrheit, Typen via `z.infer`,
Aufteilung in `BookDraft` (ohne `id`, Eingabe) und `Book` (persistiert, mit GUID-`id`).
Validierung pro Endpunkt über die **native NestJS-12-Fähigkeit** (`@Body({ schema })` +
`StandardSchemaValidationPipe`). Doku + Test-Client automatisiert über **Swagger/OpenAPI**
unter `/api`. Datenbank-Reset über einen Dev-Endpunkt.

### Entscheidungen (verbindlich)

| Thema | Entscheidung |
|---|---|
| Projektstruktur | **Plain NestJS 12, kein Nx.** Ein Repo, `nest build` → `dist/` → `npm publish`. |
| Oktal-Guard-System (`/6NN/*`, `/4NN/*`) | **Ersatzlos streichen.** Ersatz: Schreiboperationen auf `/books` und `/users/:id` verlangen ein gültiges Bearer-Token; Ownership über `userId` vs. JWT-`sub`. |
| Laufzeit-DB-Ablage | **Im installierten Paket wie bisher** – `process.env.DB_PATH || join(__dirname, 'db.json')` (bei `npx` das Cache-Verzeichnis). `DB_PATH`-Override bleibt. |
| Reset | **Nur Dev-Endpunkt** `POST /dev/reset`. **Kein** CLI-Flag. |
| json-server-Query-Umfang | **Voller dokumentierter Umfang** (`_page`/`_limit`, `Link`, `X-Total-Count`, `_sort`/`_order`, `_start`/`_end`, `_gte`/`_lte`/`_ne`/`_like`, `q`, exakte Feld-Filter, `GET /users/:id/books`). Dedizierter `BookQueryService` + eigene Unit-Tests. |
| Persistenz | **JSON-Datei bleibt.** Kein SQLite/ORM. |
| Doku | **HTML-Doku-Seite entfällt.** Swagger-UI `/api`, OpenAPI-JSON `/api-json`. `public/covers/*.png` **bleibt**. |
| Detail-Routen-Schlüssel | `GET/PUT/PATCH/DELETE /books/:isbn` bleiben **nach ISBN** adressiert (Client-Kompatibilität). `id` (GUID) ist ein zusätzliches Feld. |
| `id` | Serverseitig erzeugte GUID (`crypto.randomUUID()`). Nicht mehr `id === isbn`. |
| `price` / `currency` | **Breaking (4.0.0).** `price` ist eine `number` (nicht mehr `"$34.99"`). Neues Feld `currency`, String-Literal-Enum `'EUR' \| 'USD' \| 'GBP' \| 'CNY' \| 'RUB'`, **Default `'EUR'`**. Seed-Migration: `$`-Preise → `number` + `currency: 'USD'`. |
| Validierungs-Bibliothek | **Native NestJS 12** (`StandardSchemaValidationPipe`, `@Body({ schema })`). **Kein `nestjs-zod`** (dessen Peer-Deps decken NestJS 12 nicht ab). Swagger-Schemas via **`z.toJSONSchema()`** (Zod-4-nativ). |
| Version | **4.0.0**. |

### Nicht-Ziele

- Kein Wechsel des Persistenzformats, kein ORM, keine DB-Migrationsframeworks.
- Kein Umbau der Auth-Semantik über den `accessToken`-Bugfix hinaus (Secret, Ablauf,
  bcrypt-Salt, Fehlermeldungs-Wortlaut bleiben).
- Keine neuen fachlichen Endpunkte außer `POST /dev/reset`.
- Kein Monorepo/Workspace-Tooling.
- `getBooks.js` bleibt ein Offline-Hilfsskript; wird nicht Teil der Laufzeit.

---

## 3. Verifizierte technische Fakten (Stand der Recherche)

- `@nestjs/{core,common,platform-express,swagger,jwt}` = **12.0.1**, `@nestjs/serve-static`
  = 12.0.0, `@nestjs/cli` = 12.0.0, `@nestjs/testing` = 12.0.1.
- **`StandardSchemaValidationPipe` ist in `@nestjs/common` 12.0.1 vorhanden** (ebenso
  `StandardSchemaSerializerInterceptor`). NestJS 12 akzeptiert `schema:` an `@Body()`,
  `@Query()`, `@Param()` und validiert damit gegen jede Standard-Schema-v1-Implementierung
  (Zod 4 ist konform).
- NestJS-12-Core-Pakete sind **ESM**; CommonJS-Consumer laufen via `require(esm)` auf Node
  ≥ 20.19 / ≥ 22.12. Node 26 (`.nvmrc`) ist ok.
- NestJS-12-CLI nutzt für **neue ESM**-Projekte Rspack; für ein CommonJS-Projekt bleibt der
  **tsc-Builder** Default. → `nest-cli.json` nicht auf Bundle/Rspack umstellen.
- `nestjs-zod@5.5.0` peer deps: `@nestjs/common: ^10 || ^11`, `@nestjs/swagger: ^7.4.2 ||
  ^8 || ^11` → **NestJS 12 nicht abgedeckt. Nicht verwenden.**
- **Zod 4.5.4** hat natives `z.toJSONSchema(schema, opts)`:
  - `opts.target: 'openapi-3.0'` → OpenAPI-3.0-Stil (`nullable: true` statt `anyOf[…,null]`).
    **Für `@nestjs/swagger` diesen Target verwenden.**
  - `opts.io: 'input'` → berücksichtigt `.default()` (Feld nicht `required`) → **für
    Request-Bodies**. `opts.io: 'output'` (Default) → **für Response-Schemas**.
  - `z.enum([...]).default('EUR')` wird korrekt zu `{ type:'string', enum:[…],
    default:'EUR' }`.

---

## 4. Ziel-Repo-Struktur

Der bestehende Repo-Ordner wird umgebaut. Zu **löschende** Alt-Dateien: `server.js`,
`users.js`, `constants.js`, `getBooks.js` (→ nach `tools/`), `middlewares/`, `db.json`,
`vendor/`, `public/index.html`, `public/bootstrap.min.css`, `public/highlight.pack.js`,
`public/highlight.androidstudio.css`, `test/integration.test.js` (→ portiert).

```
bookmonkey-api/                      (Repo-Root = npm-Paket)
  package.json                       s. Abschnitt 12
  tsconfig.json                      Nest-Standard + Alias @domain/*, @app/*
  tsconfig.build.json                extends tsconfig, excludes test/**, tools/**
  nest-cli.json                      { collection:"@nestjs/schematics", sourceRoot:"src",
                                        compilerOptions:{ deleteOutDir:true, assets:[…], watchAssets:true } }
  .nvmrc                             bleibt "26"
  .gitignore                         + "dist" + "bookmonkey-db.json" + "*.tgz"
  jest.config.ts                     ts-jest, roots src + test
  README.md                          s. Abschnitt 13
  CHANGELOG.md                       neu, s. Abschnitt 13
  banner.txt                         unverändert (wird nach dist/assets kopiert)
  logo.png                           bleibt (README)
  bin/
    bookmonkey-api.js                #!/usr/bin/env node  →  require('../dist/main.js')
  src/
    main.ts
    app.module.ts
    domain/
      constants.ts
      book.schema.ts
      user.schema.ts
      index.ts                       Barrel
    common/
      zod-exception.filter.ts
      legacy-string-exception.filter.ts
      no-cache.middleware.ts
      api-book-query.decorator.ts    gebündelte @ApiQuery(...) für die Query-Parameter
    database/
      database.module.ts            @Global()
      database.service.ts
    books/
      books.module.ts
      books.controller.ts            @Controller('books')
      users-books.controller.ts      @Controller('users')  →  GET :id/books
      books.service.ts
      book-query.service.ts
    auth/
      auth.module.ts
      auth.controller.ts
      auth.service.ts
      jwt-auth.guard.ts             CanActivate
      ownership.guard.ts            CanActivate
      current-user.decorator.ts     @CurrentUser() → req.claims
    dev/
      dev.module.ts
      dev.controller.ts             @Controller('dev')  →  POST reset
  assets/
    banner.txt                       Kopie/Move von Repo-root banner.txt (Quelle für dist)
    db-original.json                 migrierter Seed (s. Abschnitt 8)
    public/
      covers/**                      Move von public/covers/**
  test/
    books.e2e-spec.ts
    auth.e2e-spec.ts
    dev.e2e-spec.ts
    query.e2e-spec.ts
    helpers.ts                       tmp-DB-Setup, isUuid, Testkonstanten
  tools/
    migrate-seed.mjs                 Einmal-Skript (nicht gepackt)
    get-books.mjs                    Port von getBooks.js (nicht gepackt)
```

**`nest-cli.json` `assets`:**
`[{ "include": "assets/**/*", "outDir": "dist" }]` – so landen `banner.txt`,
`db-original.json` und `public/covers/**` unter `dist/assets/…`. Zur Laufzeit ist
`__dirname` = `dist/`.

**`tsconfig.json` Kernoptionen:** `target: "ES2022"`, `module: "commonjs"`,
`moduleResolution: "node"`, `experimentalDecorators: true`, `emitDecoratorMetadata: true`,
`strict: true`, `esModuleInterop: true`, `skipLibCheck: true`, `outDir: "./dist"`,
`baseUrl: "./"`, `paths: { "@domain/*": ["src/domain/*"], "@app/*": ["src/*"] }`.
Für die kompilierte Laufzeit müssen die Pfad-Aliase aufgelöst werden – am einfachsten
`tsc-alias` im `build`-Script (`nest build && tsc-alias -p tsconfig.build.json`) **oder**
Aliase weglassen und relative Imports nutzen. **Empfehlung:** relative Imports innerhalb
`src/` (kein `tsc-alias`), der `domain`-Ordner ist die Architekturgrenze auch ohne Alias.

---

## 5. Domain-Layer (`src/domain/`)

### `constants.ts`

1:1-Port der 5 Werte aus `constants.js` (s. Abschnitt 1). Als benannte `export const`.

### `book.schema.ts`

Deutsche Meldungen **wörtlich** aus dem Ist-`middlewares/book-validation.js` übernehmen.

```ts
import { z } from 'zod';

const requiredString = (missing: string, notString: string) =>
  z.string({ error: (issue) => (issue.input === undefined ? missing : notString) });

export const CURRENCIES = ['EUR', 'USD', 'GBP', 'CNY', 'RUB'] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Persistiertes Buch – Server vergibt die GUID. */
export const bookSchema = z.object({
  id: z.string().uuid(),
  isbn: requiredString(
    'Es muss eine ISBN angegeben werden.',
    'Die ISBN muss als String übergeben werden.',
  ),
  title: requiredString(
    'Es muss ein Titel angegeben werden.',
    'Der Titel muss als String übergeben werden.',
  ),
  subtitle: z.string().optional(),
  abstract: z.string().optional(),
  author: z.string().optional(),
  publisher: z.string().optional(),
  price: z
    .number({ error: 'price muss eine Zahl sein.' })
    .nonnegative('price darf nicht negativ sein.')
    .optional(),
  currency: z
    .enum(CURRENCIES, { error: 'currency muss EUR, USD, GBP, CNY oder RUB sein.' })
    .default('EUR'),
  numPages: z.number({ error: 'numPages muss eine Zahl sein.' }).int().nonnegative().optional(),
  cover: z.string().optional(),
  userId: z.number().optional(),
  publishedAt: z
    .union([z.iso.date(), z.iso.datetime({ offset: true })], {
      error: 'publishedAt muss ein gültiges Datum im ISO-8601-Format sein.',
    })
    .nullable()
    .optional(),
  coAuthors: z
    .array(z.string({ error: 'Jeder Eintrag in coAuthors muss ein String sein.' }), {
      error: 'coAuthors muss ein Array sein.',
    })
    .optional(),
});

/** Eingabe beim Anlegen (POST) und beim Vollersatz (PUT): Client liefert isbn, keine id. */
export const bookDraftSchema = bookSchema.omit({ id: true });

/** Teil-Update (PATCH): jedes Feld optional. */
export const updateBookSchema = bookDraftSchema.partial();

export type Book = z.infer<typeof bookSchema>;
export type BookDraft = z.infer<typeof bookDraftSchema>;
export type BookUpdate = z.infer<typeof updateBookSchema>;
```

Anmerkungen für die Umsetzung:
- `z.infer<typeof bookDraftSchema>` hat `currency: Currency` (nicht optional, weil
  `.default()`), aber im **Input** ist `currency` optional. Für DTO-Signaturen den
  Input-Typ verwenden: `type BookDraftInput = z.input<typeof bookDraftSchema>` für
  Controller-Parameter, `BookDraft`/`z.infer` für alles nach der Validierung.
- `updateBookSchema` = `.partial()` auf dem Draft: bei PATCH darf `currency` fehlen; wenn
  gesetzt, muss es ein gültiges Literal sein. **`.default('EUR')` nicht auf Update
  anwenden** (sonst überschreibt ein PATCH ohne `currency` das Feld auf `'EUR'`). `.partial()`
  entfernt den Default-Zwang; sicherheitshalber im Service nur gesetzte Keys mergen.

### `user.schema.ts`

```ts
import { z } from 'zod';
import { EMAIL_REGEX, MIN_PASSWORD_LENGTH } from './constants';

export const userCredentialsSchema = z.object({
  email: z.string().regex(EMAIL_REGEX, 'Email format is invalid'),
  password: z.string().min(MIN_PASSWORD_LENGTH, 'Password is too short'),
});
export type UserCredentials = z.infer<typeof userCredentialsSchema>;
```

Die **exakten** Auth-Fehlertexte ("Email and password are required", "Email format is
invalid", "Password is too short", "Email already exists", "Cannot find user", "Incorrect
password") werden vom `AuthService` per `BadRequestException(<string>)` geworfen und vom
`LegacyStringExceptionFilter` als blanker JSON-String ausgegeben (s. Abschnitt 7). Der
`userCredentialsSchema` ist optionaler Zucker; die „required"-Prüfung ("Email and password
are required") macht der Service selbst, weil sie eine andere Meldung als die Zod-Regex
liefert.

---

## 6. Validierung & Swagger (nativ, ohne `nestjs-zod`)

### Validierung

`main.ts`: `app.useGlobalPipes(new StandardSchemaValidationPipe())` (aus `@nestjs/common`).

Controller:

```ts
import { bookDraftSchema, updateBookSchema, type Book, type BookDraft } from '../domain';

@Post()
@HttpCode(201)
create(@Body({ schema: bookDraftSchema }) draft: BookDraft): Book { … }

@Put(':isbn')
replace(@Param('isbn') isbn: string, @Body({ schema: bookDraftSchema }) draft: BookDraft): Book { … }

@Patch(':isbn')
update(@Param('isbn') isbn: string, @Body({ schema: updateBookSchema }) patch: BookUpdate): Book { … }
```

Verhalten bei Validierungsfehler: `StandardSchemaValidationPipe` wirft eine
`BadRequestException`, deren `getResponse()` die Standard-Schema-Issues transportiert.
**Fallback-Absicherung:** falls sich die Issue-Struktur als unpraktisch erweist, statt der
Pipe pro Body-Parameter eine winzige eigene Pipe verwenden:

```ts
class ZodBody<T extends z.ZodTypeAny> implements PipeTransform {
  constructor(private schema: T) {}
  transform(value: unknown) {
    const r = this.schema.safeParse(value);
    if (!r.success) throw r.error;        // roher ZodError → ZodExceptionFilter
    return r.data;
  }
}
// @Body(new ZodBody(bookDraftSchema)) draft: BookDraft
```

Der `ZodExceptionFilter` (Abschnitt 7) fängt **beide** Formen (`ZodError` **und**
`BadRequestException` mit Issue-Payload) und bildet auf das dokumentierte Fehlerobjekt ab.
Die Umsetzung soll in Phase 3 kurz beide Wege ausprobieren und den einfacheren nehmen; der
Default ist die native Pipe.

### Swagger

`main.ts`:

```ts
const config = new DocumentBuilder()
  .setTitle('BookMonkey API')
  .setDescription('Demo-Backend für workshops.de – Bücher-CRUD, Auth, Dev-Reset.')
  .setVersion('4.0.0')
  .addBearerAuth()
  .build();
const doc = SwaggerModule.createDocument(app, config);
SwaggerModule.setup('api', app, doc);   // UI: /api   JSON: /api-json
```

Da **kein `createZodDto`**: Request-/Response-Schemas per `z.toJSONSchema` erzeugen und in
`@ApiBody` / `@ApiResponse` als rohe Schema-Objekte einhängen. Einmalig zentral in
`common/openapi.ts`:

```ts
import { z } from 'zod';
import { bookSchema, bookDraftSchema } from '../domain';

const toOpenApi = (s: z.ZodTypeAny, io: 'input' | 'output') =>
  z.toJSONSchema(s, { target: 'openapi-3.0', io, unrepresentable: 'any' }) as Record<string, unknown>;

export const BOOK_OUTPUT_SCHEMA = toOpenApi(bookSchema, 'output');
export const BOOK_DRAFT_INPUT_SCHEMA = toOpenApi(bookDraftSchema, 'input');
export const BOOK_UPDATE_INPUT_SCHEMA = toOpenApi(bookDraftSchema.partial(), 'input');
export const VALIDATION_ERROR_SCHEMA = {
  type: 'object',
  properties: {
    errors: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: { msg: { type: 'string' }, param: { type: 'string' }, location: { type: 'string' } },
      },
    },
  },
} as const;
```

Controller-Annotationen: `@ApiTags('books'|'auth'|'dev')`, `@ApiBearerAuth()` an
Schreib-Routen, `@ApiBody({ schema: BOOK_DRAFT_INPUT_SCHEMA })`,
`@ApiOkResponse({ schema: BOOK_OUTPUT_SCHEMA })`,
`@ApiResponse({ status: 400, schema: VALIDATION_ERROR_SCHEMA })`. Für `GET /books` die
Query-Parameter über den gebündelten `@ApiBookQuery()`-Decorator
(`common/api-book-query.decorator.ts`), der `applyDecorators(ApiQuery(...), …)` für
`_page`, `_limit`, `_sort`, `_order`, `_start`, `_end`, `q` und einen generischen Hinweis
auf Feld-Filter/`_gte`/`_lte`/`_ne`/`_like` bündelt.

---

## 7. Filter & Middleware (`src/common/`)

### `ZodExceptionFilter` — `zod-exception.filter.ts`

`@Catch(ZodError, BadRequestException)`. Ziel-Form (dokumentierter Contract, aus
`public/index.html` Ist):

```json
{ "errors": { "isbn": { "msg": "…", "param": "isbn", "location": "body" }, "title": { … } } }
```

Logik:

1. Issues bestimmen:
   - `exception instanceof ZodError` → `exception.issues`.
   - sonst `BadRequestException`: `const r = exception.getResponse()`. Wenn `r` bzw.
     `r.message` bzw. `r.errors` ein Array von Standard-Schema-Issues (`{ path, message }`)
     enthält → dieses. Andernfalls **nicht** dieses Filter zuständig → `throw exception`
     bzw. Standard-Nest-Antwort durchreichen (kein Doppel-Handling mit
     `LegacyStringExceptionFilter`).
2. `errors` bauen: pro Issue `field = String(issue.path[0] ?? '_')`; **ersten** Treffer je
   Feld behalten (`errors[field] ??= { msg: issue.message, param: field, location: 'body' }`).
3. `response.status(400).json({ errors })`.

Reihenfolge in `main.ts`: `app.useGlobalFilters(new ZodExceptionFilter(), new
LegacyStringExceptionFilter())` – spezifischer Filter zuerst.

### `LegacyStringExceptionFilter` — `legacy-string-exception.filter.ts`

`@Catch(HttpException)`. Wenn `exception.getResponse()` ein **String** ist (bzw.
`{ message: <string>, statusCode }` mit String-`message` und ohne `error`-Feld), Body
**blank** als JSON-String senden: `response.status(status).json(<string>)`. Sonst
Standard-Nest-Verhalten (`response.status(status).json(getResponse())`). Damit bleiben die
Auth-Fehler exakt wie heute (`res.jsonp('Incorrect password')`).

### `NoCacheMiddleware` — `no-cache.middleware.ts`

Setzt `Cache-Control: no-cache` auf alle Antworten (Ersatz für den json-server-no-cache-
Helfer). In `AppModule.configure()` per `consumer.apply(NoCacheMiddleware).forRoutes('*')`.
Statische Cover-Dateien dürfen cachen → optional auf `/books`, `/users`, `/dev` beschränken.

### `morgan` & `compression` & CORS

In `main.ts` als Express-Middleware:

```ts
app.use(morgan('dev'));          // farbige Request-Zeile wie heute (json-server-Default)
app.use(compression());
app.enableCors({ origin: true, credentials: true, exposedHeaders: ['X-Total-Count', 'Link'] });
app.use(express.json({ limit: '10mb' }));   // bodyParser-Limit wie heute
```

### Middleware-Urteile (vollständig)

| Ist | Urteil | Umsetzung |
|---|---|---|
| json-server-Default: morgan `dev` | **portieren** | `app.use(morgan('dev'))`. |
| json-server-Default: CORS permissiv | **portieren** | `app.enableCors({ origin:true, credentials:true, exposedHeaders:['X-Total-Count','Link'] })`. |
| json-server-Default: compression | **portieren** | `app.use(compression())`. |
| json-server-Default: no-cache | **portieren** | `NoCacheMiddleware`. |
| json-server-Default: static `public/` | **portieren (nur `covers/`)** | `ServeStaticModule.forRoot({ rootPath: join(__dirname,'assets/public'), serveRoot: '/' })`, zuletzt registriert. |
| `shared.bodyParsingHandler` | **verwerfen** | Nest/Express bringt es mit; nur `limit:'10mb'` setzen. |
| `shared.errorHandler` | **verwerfen** | ersetzt durch globale Filter. |
| `shared.forbidUpdateOn` / `forbidMethod` / `goNext` | **verwerfen** | im Repo ungenutzt. |
| `users.js`-Router | **portieren** → `AuthModule` | inkl. `accessToken`-Bugfix. |
| `middlewares/guards.js` Oktal-Prefix-System + `flattenUrl` + `rewriter`/`parseGuardsRules` | **verwerfen** | halbtot, unsicher, orthogonal zum Zweck. Doku-Abschnitt entfällt (ohnehin Swagger). |
| `guards.js` `loggedOnly` | **portieren** → `JwtAuthGuard` | an Schreib-Routen von `books` + `users` gebunden. |
| `guards.js` `privateOnly` | **portieren (vereinfacht)** → `OwnershipGuard` | s. Abschnitt 9. |
| `middlewares/book-validation.js` | **portieren** → Zod-Schemas + `ZodExceptionFilter` | gleiche Felder/Meldungen; PATCH wird jetzt auch validiert; `req.body.id = req.body.isbn` entfällt. |

---

## 8. Datenbank, Seed & Reset (`src/database/`, `tools/`)

### Seed-Migration — `tools/migrate-seed.mjs` (einmal ausführen, nicht packen)

Liest das **Repo-Root `db-original.json`** (1 User, 250 Bücher), transformiert und schreibt
`assets/db-original.json` (2-Space-Indent, `\n` am Ende):

- `users`: unverändert übernehmen (`admin@bookmonkey.api`, id 1, vorhandener bcrypt-Hash).
- pro Buch:
  - `id = crypto.randomUUID()` (neu), `isbn` unverändert lassen.
  - `price`: aus dem String parsen – `Number(String(price).replace(/[^0-9.]/g, ''))`;
    `NaN` → Feld weglassen. (Alle 250 Seed-Werte sind `"$X.XX"` → sauber parsebar.)
  - `currency = 'USD'` (Seed-Preise sind dollar-denominiert).
  - alle übrigen Felder unverändert (`title`, `subtitle`, `isbn`, `abstract`, `author`,
    `publisher`, `numPages`, `cover`, `userId`, `publishedAt`, `coAuthors`).
- Reihenfolge der Bücher beibehalten (Tests hängen an `_page`/Position nicht, aber
  `KNOWN_ISBN` muss enthalten sein – ist es).

Danach: Repo-Root `db-original.json` und `db.json` **aus dem Repo entfernen**;
`assets/db-original.json` ist der einzige gepflegte Seed. `bookmonkey-db.json` und `dist/`
in `.gitignore`.

### `get-books.mjs` — Port von `getBooks.js`

Gleiche Funktion (Offline-Neuerzeugung des Seeds aus `api.itbook.store` + Cover-Download).
Anpassen: `id: crypto.randomUUID()`, `price: Number(price.replace(/[^0-9.]/g,''))`,
`currency: 'USD'`. Schreibt direkt `assets/db-original.json`. Nicht in `files`.

### `DatabaseService` — `database/database.service.ts` (`@Global` via `DatabaseModule`)

```ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Book } from '../domain';

export interface UserRecord { id: number; email: string; password: string; [k: string]: unknown; }
export interface DbShape { users: UserRecord[]; books: Book[]; }

@Injectable()
export class DatabaseService implements OnModuleInit {
  private readonly logger = new Logger('Database');
  private readonly seedPath = join(__dirname, '..', 'assets', 'db-original.json'); // dist/assets/…
  private readonly dbPath = process.env.DB_PATH || join(__dirname, '..', 'db.json'); // dist/db.json
  private data!: DbShape;

  onModuleInit(): void {
    if (!existsSync(this.dbPath)) this.restoreSeed();
    else this.load();
  }

  private load(): void {
    this.data = JSON.parse(readFileSync(this.dbPath, 'utf-8'));
    this.logger.log(`Loaded ${this.data.books.length} books, ${this.data.users.length} users from ${this.dbPath}`);
  }

  restoreSeed(): void {
    copyFileSync(this.seedPath, this.dbPath);
    this.load();
    this.logger.log('Database reset from seed');
  }

  commit(): void {
    writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2));
  }

  get books(): Book[] { return this.data.books; }
  get users(): UserRecord[] { return this.data.users; }
}
```

> **Achtung Pfad-Auflösung:** `__dirname` der kompilierten `database.service.js` ist
> `dist/database/`. `nest-cli.json`-Assets landen unter `dist/assets/`. Also `join(__dirname,
> '..', 'assets', 'db-original.json')` und `join(__dirname, '..', 'db.json')`. In Phase 0/2
> per Pack-Test verifizieren und Pfade ggf. anpassen.

`BooksService` / `AuthService` mutieren `db.books` / `db.users` in-place und rufen danach
`db.commit()`.

### Reset-Endpunkt

`DevController` `@Post('reset')` (`@Controller('dev')` → `POST /dev/reset`), `@HttpCode(200)`,
ruft `databaseService.restoreSeed()`, Antwort `{ "ok": true }`. `@ApiTags('dev')`,
Beschreibung „Setzt die Datenbank auf den Auslieferungsstand zurück (Workshop-Werkzeug)."
**Kein** Auth-Guard (Workshop-Komfort).

---

## 9. Auth (`src/auth/`)

`AuthModule`: `imports: [JwtModule.register({ secret: JWT_SECRET_KEY, signOptions: {
expiresIn: JWT_EXPIRES_IN } })]`, `providers: [AuthService, JwtAuthGuard, OwnershipGuard]`,
`exports: [JwtAuthGuard, OwnershipGuard]`.

### `AuthController` (`@Controller()` – Pfade explizit)

- `@Post(['users', 'register', 'signup'])` → `register`
- `@Post(['login', 'signin'])` → `login`
- `@Put('users/:id')` → `updateUser`
- `@Patch('users/:id')` → `updateUser`

### `AuthService` (Port von `users.js`, Verhalten identisch außer Bugfix)

- **`register(body)`**: `{ email, password, ...rest }`.
  - fehlt `email`/`password` (leer/whitespace) → `BadRequestException('Email and password are required')`.
  - `email` ungültig (Regex) → `BadRequestException('Email format is invalid')`.
  - `password.length < 4` → `BadRequestException('Password is too short')`.
  - `users.find(u => u.email === email)` existiert → `BadRequestException('Email already exists')`.
  - `hash = await bcrypt.hash(password, SALT_LENGTH)`; neuer Datensatz `{ id: <nextUserId>,
    email, password: hash, ...rest }` (numerische fortlaufende id wie json-server:
    `Math.max(0, ...users.map(u=>Number(u.id))) + 1`); `db.users.push(...)`; `db.commit()`.
  - `accessToken = await jwtService.signAsync({ email }, { subject: String(user.id) })`.
  - **Antwort `201 { accessToken, user }`** (Bugfix – heute `undefined`).
- **`login(body)`**: `email`/`password` erforderlich (gleiche „required"-Meldung wie
  `register`? – im Ist ruft `login` `validate({required:true})`, also **ja**);
  `user = users.find(...)` → sonst `BadRequestException('Cannot find user')`;
  `await bcrypt.compare(password, user.password)` falsch → `BadRequestException('Incorrect password')`;
  sonst `200 { accessToken, user }`.
- **`updateUser(id, body)`**: wenn `body.password` gesetzt → `body.password = await
  bcrypt.hash(body.password, SALT_LENGTH)`. Dann den User in `db.users` mit `id` mergen
  (`PUT` = Vollersatz unter Beibehaltung von `id`; `PATCH` = Merge), `db.commit()`, den
  aktualisierten User zurückgeben. (Im Ist übernimmt json-server den Write; hier selbst
  machen.) `404` wenn kein User mit `id`. **Kein** Token-Neuausstellen (wie Ist-TODO).

Alle String-Fehler landen über `LegacyStringExceptionFilter` als blanker JSON-String.

### `JwtAuthGuard` (`CanActivate`)

- `Authorization`-Header lesen; Schema muss `Bearer` sein; Token vorhanden.
- fehlt/fehlerhaft → `UnauthorizedException` (401). (Ist-Verhalten von `loggedOnly`.)
- `jwtService.verify(token, { secret: JWT_SECRET_KEY })`; bei Fehler → 401.
- Erfolg: `req.claims = <decoded>` (`{ email, sub, iat, exp }`).

### `OwnershipGuard` (`CanActivate`, läuft nach `JwtAuthGuard`)

Vereinfachte, ehrliche Variante von `privateOnly`:

- Methoden `POST`/`PUT`: vergleiche `req.body.userId` (falls gesetzt) mit
  `Number(req.claims.sub)`; Mismatch → `ForbiddenException` (403). Fehlt `userId` im Body →
  durchlassen (nur Login-Pflicht).
- Methoden `PATCH`/`DELETE` auf `/books/:isbn`: Datensatz laden; wenn er ein `userId` hat
  und `!== Number(req.claims.sub)` → 403; sonst ok.
- `users/:id`-Routen: `Number(id) === Number(req.claims.sub)` sonst 403.

### Gebundene Guards

- `BooksController`: `@UseGuards(JwtAuthGuard, OwnershipGuard)` an `POST`, `PUT`, `PATCH`,
  `DELETE`. `GET`-Routen bleiben offen.
- `AuthController.updateUser` (`PUT`/`PATCH /users/:id`): `@UseGuards(JwtAuthGuard,
  OwnershipGuard)`.
- `register`/`login`: offen.

`@CurrentUser()` Param-Decorator liefert `req.claims` für Handler, die den User brauchen.

---

## 10. Books (`src/books/`)

### `BooksController` (`@Controller('books')`, `@ApiTags('books')`)

| Handler | Route | Details |
|---|---|---|
| `list` | `GET /` | `@Query() query: Record<string,string \| string[]>`, `@Res({ passthrough:true }) res`. Ruft `bookQueryService.apply(db.books, query, res)`. Gibt Array zurück (Nest serialisiert), Header `X-Total-Count`/`Link` hat der Service auf `res` gesetzt. `@ApiBookQuery()`, `@ApiOkResponse({ schema: { type:'array', items: BOOK_OUTPUT_SCHEMA } })`. |
| `findOne` | `GET /:isbn` | `db.books.find(b => b.isbn === isbn)`; `NotFoundException` sonst. |
| `create` | `POST /` | `@Body({ schema: bookDraftSchema })`; `id = randomUUID()`; falls `cover` fehlt: `cover = \`http://localhost:4730/covers/${isbn}.png\`` (Ist-Konvention – Port 4730 hart, wie heute); `currency` ist nach Validierung gesetzt (Default `'EUR'`); `db.books.push`; `db.commit()`; `201`, gibt das Buch zurück. `@UseGuards(...)`, `@ApiBearerAuth()`. Bei doppelter `isbn`: **wie json-server** zulassen (kein Konflikt-Check) – oder bewusst `409`? → **Ist-Verhalten beibehalten: zulassen.** |
| `replace` | `PUT /:isbn` | `@Body({ schema: bookDraftSchema })`. Buch per `isbn` finden (`404` sonst). Neues Objekt = `{ ...draft, id: <bestehende id>, isbn }`. **`id` bleibt stabil.** ersetzen; `commit()`; `200`. |
| `update` | `PATCH /:isbn` | `@Body({ schema: updateBookSchema })`. Buch finden (`404`), nur die im Patch **vorhandenen** Keys mergen (kein `currency`-Default-Überschreiben), `id`/`isbn` unverändert; `commit()`; `200`. |
| `remove` | `DELETE /:isbn` | Buch finden (`404`), aus `db.books` entfernen, `commit()`; `@HttpCode(200)`, Body `{}`. |

### `UsersBooksController` (`@Controller('users')`, `@ApiTags('books')`)

- `findByUser` | `GET /:id/books` → `const subset = db.books.filter(b => String(b.userId)
  === String(id)); return bookQueryService.apply(subset, query, res);` (Query-Pipeline
  komponiert, damit `_page`/`_sort`/Filter auch hier greifen; Ist-json-server erlaubt das).

### `BooksService`

Kapselt Zugriff auf `DatabaseService` (find/insert/replace/patch/remove + `commit`). Keine
Business-Logik über das oben Beschriebene hinaus. Controller ruft Service; `randomUUID` und
`cover`-Default im Service.

---

## 11. `BookQueryService` — json-server-Query-Emulation (`src/books/book-query.service.ts`)

Signatur: `apply(all: Book[], raw: Record<string, string | string[]>, res: Response): Book[]`.
Pipeline-Reihenfolge: **Volltext `q` → Feld-Filter/Operatoren → Sortierung → Pagination →
Header**.

- **`q`**: `String(raw.q).toLowerCase()`; `items = items.filter(b =>
  JSON.stringify(b).toLowerCase().includes(needle))`.
- **reservierte Keys** (nicht als Feld-Filter behandeln): `_page`, `_limit`, `_sort`,
  `_order`, `_start`, `_end`, `q`.
- **Feld-Filter / Operatoren**: für jeden übrigen Key:
  - Regex `^(.+)_(gte|lte|ne|like)$`:
    - `_gte` / `_lte`: numerischer Vergleich wenn beide Seiten zu `Number` parsebar, sonst
      lexikografisch. `>=` bzw. `<=`.
    - `_ne`: `String(feldwert) !== wert`.
    - `_like`: `new RegExp(wert, 'i').test(String(feldwert))`.
  - sonst exakter Vergleich `String(feldwert) === wert`.
  - Mehrfachwerte (`?id=a&id=b`, Array) → **OR** innerhalb des Keys.
  - Wert-Coercion für exakten Vergleich: Zahl-Strings zu Zahl (`'115'` matcht `numPages:
    115`).
- **Sortierung**: `raw._sort` kommagetrennt, `raw._order` kommagetrennt parallel
  (`'asc'`/`'desc'`, Default `asc`). Stabiler Multi-Key-Vergleich.
- **Pagination**:
  - wenn `raw._page` gesetzt: `limit = Number(raw._limit ?? 10)`, `page = max(1,
    Number(raw._page))`, `start = (page-1)*limit`. `res.setHeader('X-Total-Count',
    String(total))`; `res.setHeader('Link', <RFC-5988 first/prev/next/last>)` – Basis-URL
    aus `res.req.originalUrl` (Pfad + Querystring, `_page` ersetzt). `items =
    items.slice(start, start+limit)`.
  - sonst wenn `raw._start`/`_end`/`_limit` gesetzt: `start = Number(raw._start ?? 0)`;
    `end = raw._end != null ? Number(raw._end) : (raw._limit != null ? start +
    Number(raw._limit) : undefined)`; `res.setHeader('X-Total-Count', String(total))`;
    `items = items.slice(start, end)`.
  - sonst: alles zurück, **kein** `X-Total-Count` (Ist-json-server setzt den Header nur bei
    Slicing/Paging – in Phase 3 gegen echtes json-server-Verhalten gegenchecken; Test (3)
    erwartet den Header bei `_page`).
- `total` wird **vor** dem Slicing bestimmt (nach Filter/Sort).

**Unit-Tests** direkt aus den Beispiel-URLs der Ist-`public/index.html` ableiten. `_embed`
/ `_expand` sind **nicht** dokumentiert → nicht implementieren, im CHANGELOG als „nicht
unterstützt" vermerken.

---

## 12. `main.ts`, `package.json`, Build & Publish

### `src/main.ts` (Ablauf)

```ts
import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import morgan from 'morgan';
import compression from 'compression';
import { NestFactory } from '@nestjs/core';
import { StandardSchemaValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ZodExceptionFilter } from './common/zod-exception.filter';
import { LegacyStringExceptionFilter } from './common/legacy-string-exception.filter';

async function bootstrap(): Promise<void> {
  // optionales, minimales Arg-Parsing: --port <n>, --help/-h. KEIN --reset.
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write('Usage: bookmonkey-api [--port <number>]\n');
    return;
  }
  const portArgIdx = argv.indexOf('--port');
  const port = Number(
    (portArgIdx >= 0 ? argv[portArgIdx + 1] : undefined) ?? process.env.PORT ?? 4730,
  );

  process.stdout.write(readFileSync(join(__dirname, 'assets', 'banner.txt'), 'ascii') + '\n');

  const app = await NestFactory.create(AppModule, { logger: ['log', 'warn', 'error'] });
  app.use(morgan('dev'));
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.enableCors({ origin: true, credentials: true, exposedHeaders: ['X-Total-Count', 'Link'] });
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.useGlobalFilters(new ZodExceptionFilter(), new LegacyStringExceptionFilter());
  app.enableShutdownHooks();

  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('BookMonkey API').setVersion('4.0.0').addBearerAuth().build(),
  );
  SwaggerModule.setup('api', app, doc);

  await app.listen(port);
  // historische Logzeile-Optik beibehalten:
  process.stdout.write(`BookMonkey API läuft auf http://localhost:${port} — Doku: http://localhost:${port}/api\n`);
}
void bootstrap();
```

> Falls `StandardSchemaValidationPipe` beim Import/Einsatz Probleme macht: auf die
> `ZodBody`-Pipe pro Parameter ausweichen (Abschnitt 6) und die globale Pipe weglassen.

### `bin/bookmonkey-api.js`

```js
#!/usr/bin/env node
require('../dist/main.js');
```

Ausführbar-Bit setzt npm beim Installieren anhand des `bin`-Felds; im Repo zusätzlich
`chmod +x bin/bookmonkey-api.js`.

### `package.json` (Ziel)

```jsonc
{
  "name": "bookmonkey-api",
  "version": "4.0.0",
  "description": "A simple backend for the BookMonkey example application.",
  "author": "workshops.de",
  "license": "MIT",
  "bin": { "bookmonkey-api": "bin/bookmonkey-api.js" },
  "main": "dist/main.js",
  "files": ["dist/", "bin/"],
  "engines": { "node": ">=22.12.0" },
  "scripts": {
    "build": "nest build",
    "start": "node dist/main.js",
    "start:dev": "nest start --watch",
    "test": "jest",
    "test:e2e": "jest --config test/jest-e2e.json",
    "lint": "eslint \"src/**/*.ts\" \"test/**/*.ts\"",
    "prepublishOnly": "npm run lint && npm test && npm run test:e2e && npm run build"
  },
  "dependencies": {
    "@nestjs/common": "^12.0.1",
    "@nestjs/core": "^12.0.1",
    "@nestjs/platform-express": "^12.0.1",
    "@nestjs/jwt": "^12.0.1",
    "@nestjs/serve-static": "^12.0.0",
    "@nestjs/swagger": "^12.0.1",
    "bcryptjs": "^3.0.3",
    "compression": "^1.7.4",
    "express": "^5.0.0",
    "morgan": "^1.10.0",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "zod": "^4.5.4"
  },
  "devDependencies": {
    "@nestjs/cli": "^12.0.0",
    "@nestjs/schematics": "^12.0.0",
    "@nestjs/testing": "^12.0.1",
    "@types/compression": "^1.7.5",
    "@types/express": "^5.0.0",
    "@types/jest": "^29.5.12",
    "@types/morgan": "^1.9.9",
    "@types/node": "^22.10.0",
    "@types/supertest": "^6.0.2",
    "jest": "^29.7.0",
    "supertest": "^7.2.2",
    "ts-jest": "^29.2.5",
    "typescript": "^5.6.0"
  },
  "publishConfig": { "access": "public" },
  "repository": { "type": "git", "url": "git+https://github.com/workshops-de/bookmonkey-api.git" },
  "bugs": { "url": "https://github.com/workshops-de/bookmonkey-api/issues" },
  "homepage": "https://github.com/workshops-de/bookmonkey-api#readme",
  "keywords": ["api", "books", "demo", "workshop"]
}
```

Anmerkungen:
- `jsonwebtoken` entfällt (via `@nestjs/jwt`). `json-server`, `express-validator`,
  `compose-middleware`, `express-conditional-middleware`, `supertest` (bleibt dev) raus.
- `overrides.qs` prüfen, ob noch nötig (mit `express 5` vermutlich nicht) – sonst entfernen.
- `@nestjs/platform-express@12.0.1` bringt **`express@5.2.1`** → `express@^5` /
  `@types/express@^5` sind korrekt (verifiziert).
- **Kein Bundling.** `nest build` (tsc-Builder) emittiert `dist/` mit erhaltener Struktur;
  `nest-cli.json`-Assets kopieren `assets/**` nach `dist/assets`. `npm publish` liefert
  `dist/` + `bin/`. `npx` installiert `dependencies` normal (wie heute, andere Liste).
- **Vor jedem Release:** `npm pack` → in leerem Verzeichnis `npx ./bookmonkey-api-4.0.0.tgz`
  → Boot auf 4730, `/api`, `GET /books`, `POST /dev/reset` prüfen (s. Abschnitt 16).

---

## 13. Doku / README / CHANGELOG

- `public/index.html`, `public/bootstrap.min.css`, `public/highlight.pack.js`,
  `public/highlight.androidstudio.css` löschen. `public/covers/**` → `assets/public/covers/**`.
- **README.md**: „Open the documentation on `http://localhost:4730/`" → `…/api` (Swagger).
  „Supported actions"-Tabelle bleibt (`GET /books`, `GET /books/:isbn`, `POST /books`,
  `PUT /books/:isbn`, `DELETE /books/:isbn`). Ergänzen: `id` ist eine GUID ≠ `isbn`; `price`
  ist eine Zahl; `currency` (Default `EUR`); `POST /dev/reset` setzt die DB zurück; Demo-User
  `admin@bookmonkey.api` / `password1!` (Passwort gegen den Seed-bcrypt-Hash **verifiziert**).
- **CHANGELOG.md** (neu), Abschnitt `## 4.0.0 — Breaking Changes`:
  - `id` ist jetzt eine server-generierte GUID (früher identisch mit `isbn`). Routen bleiben
    nach `:isbn` adressiert.
  - `price` ist `number` (früher String `"$34.99"`); neues Pflicht-/Default-Feld `currency`
    (`EUR` Default; zulässig `EUR|USD|GBP|CNY|RUB`). Seed-Bücher: `currency: "USD"`.
  - Oktal-Guard-Prefix-Routen (`/660/...` etc.) entfernt. Schreiboperationen erfordern jetzt
    `Authorization: Bearer <token>`.
  - HTML-Doku-Seite entfernt → Swagger-UI unter `/api`.
  - Register-Antwort enthält jetzt ein echtes `accessToken` (vorher `undefined`).
  - Validierung jetzt Zod-basiert; Fehler-Body-Form unverändert
    (`{ errors: { feld: { msg, param, location } } }`); Auth-Fehler weiterhin blanker String.
  - `json-server`-spezifische Query-Extras `_embed` / `_expand` werden nicht unterstützt.

---

## 14. Tests

Runner **Jest + ts-jest** (`@nestjs/testing`). E2E in `test/` mit `supertest` gegen die
echte App: `Test.createTestingModule({ imports: [AppModule] }).compile()` →
`app = moduleRef.createNestApplication()` → dieselbe `main.ts`-Konfiguration anwenden
(CORS `exposedHeaders`, globale Pipe, globale Filter) → `app.init()`.
`test/helpers.ts`: kopiert `assets/db-original.json` in ein `os.tmpdir()`-Verzeichnis,
setzt `process.env.DB_PATH` **vor** dem Modul-Import, räumt in `afterAll` auf; exportiert
`isUuid(v)` (RFC-4122 v4 Regex) und `KNOWN_ISBN='1001606140805'`, `KNOWN_TITLE='Java Web
Scraping Handbook'`.

### Portierte Szenarien (aus `test/integration.test.js`), angepasst

1. **creates a book** – `POST /books` (mit Bearer-Token!) `{ isbn, title, publishedAt,
   coAuthors, price: 9.99 }` → 201; `isUuid(res.body.id)` **und** `res.body.id !== isbn`;
   `isbn`/`title`/`publishedAt`/`coAuthors` gespiegelt; `res.body.currency === 'EUR'`;
   `res.body.price === 9.99`.
2. **gets a single book by known isbn** – `GET /books/<KNOWN_ISBN>` → 200; `res.body.isbn
   === KNOWN_ISBN`; `isUuid(res.body.id) && res.body.id !== KNOWN_ISBN`; `res.body.title
   === KNOWN_TITLE`; `typeof res.body.price === 'number'`; `res.body.currency === 'USD'`;
   `'publishedAt' in res.body`; `Array.isArray(res.body.coAuthors)`.
3. **paginated books** – `GET /books?_page=2&_limit=5` → 200; Array-Länge 5;
   `Number(res.headers['x-total-count']) === 250` (bzw. `> 5`).
4. **PUT merges coAuthors** – `POST` dann `GET` dann `PUT` (Bearer) mit `coAuthors:
   [...alt, 'Second Author']` → 200; Antwort + Reload persistiert; `res.body.id` identisch
   zum Wert nach `POST` (Stabilität).
5. **PUT changes publishedAt** – analog, `publishedAt` geändert, persistiert.

### Neue Tests

- **GUID-Identität**: `POST` → `GET /books/:isbn` → `isUuid(id) && id !== isbn`.
- **currency-Default & -Validierung**: `POST` ohne `currency` → `currency==='EUR'`;
  `POST` mit `currency:'XXX'` → 400, Body `{ errors: { currency: { msg: 'currency muss
  EUR, USD, GBP, CNY oder RUB sein.', param:'currency', location:'body' } } }`.
- **price-Typ**: `POST` mit `price:'9.99'` (String) → 400 mit `price`-Meldung; `POST` mit
  `price:-1` → 400 („price darf nicht negativ sein.").
- **Pflichtfeld-Fehlerform**: `POST /books` `{}` (mit Bearer) → 400, Body **deep equals**
  `{ errors: { isbn: { msg:'Es muss eine ISBN angegeben werden.', param:'isbn',
  location:'body' }, title: { msg:'Es muss ein Titel angegeben werden.', param:'title',
  location:'body' } } }`.
- **Auth-Guard**: `POST /books` mit gültigem Body **ohne** `Authorization` → 401;
  `DELETE /books/:isbn` ohne Token → 401.
- **Register-Bugfix**: `POST /register` `{ email:'neu@bookmonkey.api', password:'secret1' }`
  → 201; `typeof res.body.accessToken === 'string'` und JWT-decodebar; `res.body.user.email`
  gesetzt; `res.body.user.password` ist ein bcrypt-Hash (`/^\$2[aby]\$/`).
- **Login**: mit dem eben registrierten User → 200 `{ accessToken, user }`; falsches
  Passwort → 400 Body === `"Incorrect password"` (blanker String); unbekannte Mail → 400
  `"Cannot find user"`.
- **`POST /dev/reset`**: Buch `isbn:'temp-xyz'` anlegen → `POST /dev/reset` → 200 `{ ok:true }`
  → `GET /books/temp-xyz` 404 → `GET /books/<KNOWN_ISBN>` 200 → `GET
  /books?_page=1&_limit=1000` Länge 250.
- **Swagger**: `GET /api-json` → 200, `application/json`, enthält Pfade `/books`,
  `/books/{isbn}`, `/dev/reset`, `/login`. `GET /api` → 200 `text/html`.
- **Cover statisch**: `GET /covers/1001606140805.png` → 200 `image/png`.
- **`GET /users/:id/books`**: → 200, Array, alle mit `userId === 1`.

### Unit-Tests (`src/**/*.spec.ts`)

- `BookQueryService`: `q`, exakter Feld-Filter, `_gte`/`_lte`/`_ne`/`_like`, Multi-Key-Sort
  mit `_order`, `_start`/`_end`, Default-`_limit` 10, `X-Total-Count`, `Link`-Header-Format,
  Mehrfachwert-OR.
- `ZodExceptionFilter`: `ZodError` → Ziel-Form; verpackte `BadRequestException` → Ziel-Form;
  nicht-Validierungs-`BadRequestException` → durchgereicht.
- `LegacyStringExceptionFilter`: String-`getResponse()` → blanker Body; Objekt → Standard.
- `DatabaseService`: `load`/`commit`/`restoreSeed` mit tmp-Pfad; `onModuleInit` legt DB aus
  Seed an, wenn Datei fehlt.

---

## 15. Phasenplan (Checkpoint = App bootet auf 4730 + jeweilige Tests grün)

0. **Gerüst + Publish-Spike.** Alt-Dateien beiseite; `package.json` (Abschnitt 12),
   `tsconfig*.json`, `nest-cli.json`, `jest.config`, eslint. `npm install`. `src/main.ts`
   minimal (`AppModule` leer, `listen(4730)`, Banner). `bin/bookmonkey-api.js`.
   `nest build` → `npm pack` → in Scratch-Dir `npx ./bookmonkey-api-4.0.0.tgz`: Shebang-
   Wrapper startet, Banner erscheint, Port 4730 hört, `dist/assets/**` vorhanden.
   `npm ls express` → `express`-Version in `package.json` angleichen.
1. **Domain-Layer.** `constants.ts`, `book.schema.ts`, `user.schema.ts`, `index.ts`.
   Unit-Tests der Schemata (Pflichtfelder-Meldungen, `currency`-Default/-Enum, `price`,
   `publishedAt`, `.partial()`-Verhalten). `z.toJSONSchema`-Ausgabe für `bookSchema`
   ansehen und in `common/openapi.ts` festzurren.
2. **Database + Seed.** `tools/migrate-seed.mjs` schreiben & **einmal ausführen** →
   `assets/db-original.json`. Repo-Root `db.json`/`db-original.json` löschen, `.gitignore`.
   `tools/get-books.mjs` portieren. `DatabaseModule`/`DatabaseService` + Unit-Tests.
   Demo-User-Passwort gegen den Seed-Hash verifizieren (für README).
3. **BooksModule.** `books.service.ts`, `book-query.service.ts` (+ Unit-Tests aus den
   Doku-Beispiel-URLs), `books.controller.ts`, `users-books.controller.ts`, DTO-Bindung via
   `@Body({ schema })`, `ZodExceptionFilter`, `common/openapi.ts`, `@ApiBookQuery()`.
   *Checkpoint:* portierte Szenarien 1–5 (zunächst ohne Guard) + Query-Unit-Tests grün.
4. **AuthModule.** `auth.service.ts` (Port + `accessToken`-Bugfix), `auth.controller.ts`,
   `JwtModule`, `JwtAuthGuard`, `OwnershipGuard`, `LegacyStringExceptionFilter`,
   `@CurrentUser()`. Guards an Books-Schreib-Routen + `users/:id` binden.
   *Checkpoint:* Auth-E2E (register/login/bugfix/guard-401) + Szenarien 1,4,5 jetzt **mit**
   Bearer-Token grün.
5. **DevModule + main.ts final + Plattform-Middleware + Swagger + ServeStatic + NoCache.**
   *Checkpoint:* `npm run start:dev`; `curl` gegen `/api`, `/api-json`,
   `/covers/1001606140805.png`, `/books`, `/books/<KNOWN_ISBN>`, `POST /dev/reset`,
   `/users/1/books`.
6. **Publish-Dry-Run.** `npm run build && npm pack`; Scratch-Dir-Install; vollständiger
   Smoke-Test (Abschnitt 16).
7. **Doku.** README + CHANGELOG (Abschnitt 13); Alt-Assets löschen.
8. **CI/Release.** `.github/workflows/ci.yml` → `npm ci`, `npm run lint`, `npm test`,
   `npm run test:e2e`, `npm run build`. `release-to-npm.yml` → Build-Job wie CI +
   `npm run build`; Publish-Job `npm ci` → `npm run build` → `npm publish` (Token
   unverändert). Trigger `release:[created]` bleibt. Alt-Dateien (`server.js`, `users.js`,
   `middlewares/`, `constants.js`, `vendor/`) endgültig entfernen.
9. **Contract-Diff-Review.** Jeden Endpunkt/Header/Statuscode/Body-Form aus Abschnitt 1
   gegen die neue App abgleichen; Abnahme-Checkliste im PR.

---

## 16. End-to-End-Verifikation

1. `npm run lint && npm test && npm run test:e2e` – alles grün.
2. `npm run build && npm pack` → leeres Verzeichnis, `npx ./bookmonkey-api-4.0.0.tgz`:
   - Banner erscheint; `BookMonkey API läuft auf http://localhost:4730 — Doku: …/api`.
   - `GET /api` → 200 HTML (Swagger-UI); `GET /api-json` → 200 JSON mit Pfaden
     `/books`, `/books/{isbn}`, `/login`, `/dev/reset`.
   - `GET /books?_page=2&_limit=5` → 5 Einträge; `X-Total-Count: 250`; `Link`-Header
     gesetzt.
   - `GET /books/1001606140805` → Buch; `id` GUID ≠ `isbn`; `price` Zahl; `currency` `"USD"`.
   - `POST /books` (Body gültig) **ohne** `Authorization` → 401.
   - `POST /register {email,password}` → 201 `{ accessToken:"…", user:{…} }`.
   - `POST /books` **mit** `Authorization: Bearer <accessToken>` und `{ isbn:"e2e-1",
     title:"E2E" }` → 201; Antwort hat GUID-`id`, `currency:"EUR"`.
   - `POST /books` mit `{}` (Bearer) → 400 `{ errors: { isbn:{…}, title:{…} } }` (deutsche
     Meldungen).
   - `GET /covers/1001606140805.png` → 200 `image/png`.
   - `POST /dev/reset` → 200 `{ ok:true }`; danach `GET /books/e2e-1` → 404 und
     `GET /books?_page=1&_limit=1000` → 250.
3. `DB_PATH=/tmp/bm.json npx ./bookmonkey-api-4.0.0.tgz` → `/tmp/bm.json` wird aus dem Seed
   erzeugt; Mutation + Neustart → Änderung bleibt; `POST /dev/reset` → wieder Seed-Stand.

---

## 17. Risiken & Gegenmaßnahmen

1. **`StandardSchemaValidationPipe`-Fehlerstruktur** unhandlich → `ZodBody`-Mini-Pipe pro
   Parameter (roher `ZodError`), `ZodExceptionFilter` deckt beide Wege ab. In Phase 3
   entscheiden.
2. **NestJS-12-Core ist ESM** → CommonJS-Consumer via `require(esm)`; Node 26 ok;
   Phase-0-Pack-Test bestätigt Boot.
3. **`express`-Major** (4 vs 5) je nach `@nestjs/platform-express`-12-Abhängigkeit →
   in Phase 0 `npm ls express` prüfen und `package.json`/`@types/express` angleichen;
   `overrides.qs` ggf. entfernen.
4. **`nest build` bündelt/rspackt versehentlich** → `nest-cli.json` beim tsc-Builder
   belassen, kein `builder`-Feld; `dist/`-Struktur nach Build prüfen.
5. **Asset-Pfad im `dist`** (`__dirname`-relative Auflösung von `banner.txt` und Seed) →
   Phase-0/2-Pack-Test; Pfade in `main.ts` und `DatabaseService` entsprechend setzen.
6. **json-server-Query-Nuancen** (`q`-Tiefensuche, `_like`-Regex, kommagetrennte `_sort`,
   Array-OR, `X-Total-Count` nur bei Slicing) → Unit-Tests aus den Ist-Doku-Beispiel-URLs;
   Abweichungen im CHANGELOG dokumentieren.
7. **Dokumentierten Contract brechen** (`id`≠`isbn`, `price`/`currency`, Guards weg,
   Auth-Body) → bewusst, 4.0.0-Major, CHANGELOG, Phase-9-Checkliste;
   `LegacyStringExceptionFilter` erhält Bare-String-Auth-Fehler; `X-Total-Count`/`Link` via
   `exposedHeaders`.
8. **`ServeStaticModule` überschattet API-Routen** → zuletzt registrieren; E2E-Test
   `/api` vs. `/books` vs. `/covers/*.png`.
9. **`@nestjs/swagger` akzeptiert das `z.toJSONSchema`-Objekt nicht 1:1** (z. B.
   `$schema`-Key, `additionalProperties:false`) → `target:'openapi-3.0'` nutzen und den
   `$schema`-Key vor der Übergabe entfernen (`delete (obj as any).$schema`).

---

## 18. Offene Kleinigkeiten für die Umsetzung zu entscheiden

- **Doppelte `isbn` bei `POST /books`**: Ist-json-server erlaubt es → beibehalten (kein
  `409`). Falls im Review anders gewünscht, ist ein `ConflictException` die Ein-Zeilen-
  Änderung im `BooksService`.
- **`X-Total-Count` ohne Paging**: echtes json-server-Verhalten in Phase 3 kurz prüfen und
  `BookQueryService` daran ausrichten.
- **`numPages` im Ist teils `+pages` (Number)** – Schema erzwingt `int().nonnegative()`;
  Seed-Migration muss sicherstellen, dass alle `numPages` Zahlen sind (Ist: sind sie).
- **Demo-User-Passwort**: `password1!` ist gegen den Seed-bcrypt-Hash verifiziert
  (`$2a$10$Evsbmwpt5JIsDb3hSRklq.u7zapUWPCNPl8EFE1igm9B1bqroGfSq`).
