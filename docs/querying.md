# Querying `GET /books`

`GET /books` (und `GET /users/:id/books`) emuliert die bekannten
[json-server](https://github.com/typicode/json-server)-Query-Parameter. Die
Verarbeitungs-Pipeline ist fest:

```
Volltext (q)  →  Feld-Filter & Operatoren  →  Sortierung (_sort/_order)  →  Pagination (_page/_limit bzw. _start/_end)  →  Header
```

Alle Beispiele gehen von `http://localhost:4730` und der ausgelieferten
Seed-Datenbank (50 Bücher, überwiegend bekannte Buchreihen) aus. Buchfelder:
`id`, `isbn`, `title`, `subtitle`, `abstract`, `author`, `publisher`, `price`,
`currency`, `numPages`, `cover`, `userId`, `publishedAt`, `coAuthors`,
`predecessorIsbn`, `successorIsbn`.

> Nicht unterstützt: die json-server-Extras `_embed` und `_expand`.

---

## Pagination

### Seitenweise mit `_page` / `_limit`

`_limit` ist ohne Angabe `10`. `_page` ist 1-basiert.

```
GET /books?_page=1&_limit=10      # Bücher 1–10
GET /books?_page=2&_limit=10      # Bücher 11–20
GET /books?_page=1&_limit=25      # größere Seite
GET /books?_page=3               # _limit fällt auf 10 zurück
```

Sobald `_page` gesetzt ist, liefert die Antwort zusätzliche Header:

```
X-Total-Count: 50
Link: </books?_page=1&_limit=10>; rel="first",
      </books?_page=1&_limit=10>; rel="prev",
      </books?_page=3&_limit=10>; rel="next",
      </books?_page=5&_limit=10>; rel="last"
```

`rel="prev"` entfällt auf Seite 1, `rel="next"` auf der letzten Seite. Der
`Link`-Header folgt [RFC 5988](https://www.rfc-editor.org/rfc/rfc5988) und
übernimmt alle übrigen Query-Parameter unverändert.

Header per `curl` sichtbar machen:

```bash
curl -i "http://localhost:4730/books?_page=2&_limit=5"
curl -sD - -o /dev/null "http://localhost:4730/books?_page=2&_limit=5"
```

### Slice mit `_start` / `_end` / `_limit`

Alternative ohne `_page` – schneidet direkt aus der gefilterten Liste. `_end` ist
**exklusiv**.

```
GET /books?_start=0&_end=10       # erste 10 (Index 0–9)
GET /books?_start=10&_end=20      # nächste 10
GET /books?_start=20&_limit=10    # ab Index 20, dann 10 Stück
GET /books?_limit=5              # erste 5 (start = 0)
```

Auch hier wird `X-Total-Count` gesetzt, aber **kein** `Link`-Header.

---

## Sortierung

`_sort` nennt das Feld, `_order` die Richtung (`asc` – Default – oder `desc`).
Numerische Felder werden numerisch verglichen, alles andere per
`localeCompare`. `null`/`undefined` sortieren nach vorne. Die Sortierung ist
stabil (gleiche Schlüssel behalten ihre Ursprungsreihenfolge).

```
GET /books?_sort=title                       # A→Z
GET /books?_sort=title&_order=desc            # Z→A
GET /books?_sort=numPages&_order=desc         # dickste Bücher zuerst
GET /books?_sort=price&_order=asc             # günstigste zuerst
GET /books?_sort=publishedAt&_order=desc      # neueste zuerst
```

### Mehrere Felder

`_sort` und `_order` sind kommagetrennt und werden paarweise angewandt
(erst Feld 1, bei Gleichstand Feld 2 …).

```
GET /books?_sort=author,numPages&_order=asc,desc
GET /books?_sort=currency,price&_order=asc,asc
```

### Kombiniert mit Pagination

```
GET /books?_sort=numPages&_order=desc&_page=1&_limit=5   # Top 5 nach Seitenzahl
```

---

## Volltextsuche `q`

`q` durchsucht das komplette serialisierte Buch (alle Felder,
case-insensitive) nach einem Teilstring.

```
GET /books?q=hogwarts
GET /books?q=tolkien
GET /books?q=bloomsbury          # trifft auch publisher
GET /books?q=1997                # trifft publishedAt, Preise, …
```

`q` läuft zuerst; alle weiteren Filter arbeiten auf dem Ergebnis.

```
GET /books?q=potter&_sort=title&_page=1&_limit=10
```

---

## Feld-Filter (exakt)

`?feld=wert` filtert auf Gleichheit. Zahlen-Felder werden dabei numerisch
verglichen (`?numPages=223` trifft die Zahl `223`).

```
GET /books?author=J. K. Rowling
GET /books?publisher=Bloomsbury
GET /books?currency=EUR
GET /books?numPages=223
GET /books?userId=1
```

### Mehrere Felder → UND

```
GET /books?currency=EUR&author=J. K. Rowling
```

### Mehrfachwerte pro Feld → ODER

Denselben Parameter mehrfach angeben:

```
GET /books?currency=EUR&currency=USD
GET /books?author=J. K. Rowling&author=George R. R. Martin
```

---

## Operatoren

Suffix am Feldnamen: `_gte`, `_lte`, `_ne`, `_like`.

| Suffix   | Bedeutung                     | Beispiel                          |
|----------|-------------------------------|----------------------------------|
| `_gte`   | größer oder gleich            | `?numPages_gte=300`              |
| `_lte`   | kleiner oder gleich           | `?price_lte=30`                  |
| `_ne`    | ungleich                      | `?currency_ne=USD`              |
| `_like`  | Regex, case-insensitive       | `?title_like=^harry`            |

```
GET /books?numPages_gte=300&numPages_lte=500     # Bereich (UND)
GET /books?price_gte=10&price_lte=15
GET /books?publishedAt_gte=2000-01-01            # String-Vergleich bei Datteln
GET /books?currency_ne=EUR                       # alles außer EUR
GET /books?title_like=ring                       # "ring" irgendwo im Titel
GET /books?title_like=^The                        # Titel, die mit "The" beginnen
GET /books?author_like=rowling|martin            # Regex-Alternative
```

`_gte`/`_lte` vergleichen numerisch, wenn beide Seiten Zahlen sind, sonst
lexikografisch als String. Ist der `_like`-Wert kein gültiger Regex, fällt der
Filter auf „enthält Teilstring" zurück.

---

## Alles zusammen

Realistische Kombinationen aus Volltext, Filter, Operator, Sortierung und
Pagination:

```
# Dicke EUR-Bücher, teuerste zuerst, Seite 1
GET /books?currency=EUR&numPages_gte=600&price_lte=50&_sort=price&_order=desc&_page=1&_limit=10

# Bücher ab 2000, alphabetisch
GET /books?q=potter&publishedAt_gte=2000-01-01&_sort=title&_order=asc

# Bücher eines Users, nach Seitenzahl, als 5er-Slice
GET /users/1/books?_sort=numPages&_order=desc&_start=0&_end=5

# Titel mit "the", nicht von Scholastic, neueste zuerst
GET /books?title_like=the&publisher_ne=Scholastic Press&_sort=publishedAt&_order=desc&_page=1&_limit=20
```

### `curl`-Rezepte

```bash
# Gesamtzahl der Treffer eines Filters auslesen
curl -sD - -o /dev/null "http://localhost:4730/books?currency=EUR&_page=1&_limit=1" | grep -i x-total-count

# JSON hübsch mit jq
curl -s "http://localhost:4730/books?_sort=numPages&_order=desc&_page=1&_limit=3" | jq '.[] | {title, numPages}'

# Durch alle Seiten iterieren
for p in $(seq 1 5); do
  curl -s "http://localhost:4730/books?_page=$p&_limit=50" | jq 'length'
done
```
