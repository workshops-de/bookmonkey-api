import { z } from 'zod';

export const CURRENCIES = ['EUR', 'USD', 'GBP', 'CNY', 'RUB'] as const;
export type Currency = (typeof CURRENCIES)[number];

/**
 * Persistiertes Buch – der Server vergibt die GUID.
 *
 * Bewusst ohne eigene Fehlermeldungen: es gelten die englischen
 * Zod-4-Standardtexte ("Invalid input: expected string, received undefined" …).
 */
export const bookSchema = z.object({
  id: z.uuid(),
  isbn: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  abstract: z.string().optional(),
  author: z.string().optional(),
  publisher: z.string().optional(),
  price: z.number().nonnegative().optional(),
  currency: z.enum(CURRENCIES).default('EUR'),
  numPages: z.number().int().nonnegative().optional(),
  cover: z.string().optional(),
  userId: z.number().optional(),
  publishedAt: z
    .union([z.iso.date(), z.iso.datetime({ offset: true })])
    .nullable()
    .optional(),
  coAuthors: z.array(z.string()).optional(),
  /**
   * ISBN des vorherigen bzw. nächsten Bandes derselben Reihe. `null` bei
   * Einzelbänden und an den Enden einer Reihe. Über `GET /books/:isbn` direkt
   * nachladbar – Übungen können so durch eine Serie navigieren.
   */
  predecessorIsbn: z.string().nullable().optional(),
  successorIsbn: z.string().nullable().optional(),
  /**
   * Rein serverseitig gepflegt und stets vorhanden: `createdAt` wird einmalig
   * beim Anlegen gesetzt, `updatedAt` initial auf denselben Wert und danach bei
   * jedem PUT/PATCH neu. Die Seed-Daten tragen bereits Zeitstempel.
   */
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

/**
 * Eingabe beim Anlegen (POST) und beim Vollersatz (PUT): Client liefert isbn,
 * keine id. `createdAt` / `updatedAt` sind serverseitig und daher kein Draft-Feld.
 */
export const bookDraftSchema = bookSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

/**
 * Teil-Update (PATCH): jedes Feld optional. `currency` wird bewusst **ohne**
 * `.default('EUR')` neu gesetzt – sonst würde ein PATCH ohne `currency` das Feld
 * beim Merge auf `'EUR'` überschreiben.
 */
export const updateBookSchema = bookDraftSchema
  .omit({ currency: true })
  .partial()
  .extend({ currency: z.enum(CURRENCIES).optional() });

export type Book = z.infer<typeof bookSchema>;
export type BookDraft = z.infer<typeof bookDraftSchema>;
export type BookDraftInput = z.input<typeof bookDraftSchema>;
export type BookUpdate = z.infer<typeof updateBookSchema>;
