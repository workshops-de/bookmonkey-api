import { z } from 'zod';
import { bookSchema, bookDraftSchema, updateBookSchema } from '../domain';

/**
 * Zod-4-natives JSON-Schema. `target: 'openapi-3.0'` erzeugt den
 * `@nestjs/swagger`-kompatiblen Stil (`nullable: true` statt `anyOf[…, null]`).
 * `io: 'input'` berücksichtigt `.default()` (Feld nicht `required`) → für
 * Request-Bodies; `io: 'output'` → für Response-Schemas.
 */
const toOpenApi = (
  schema: z.ZodType,
  io: 'input' | 'output',
): Record<string, unknown> => {
  const json = z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io,
    unrepresentable: 'any',
  }) as Record<string, unknown>;
  delete json.$schema;
  return json;
};

export const BOOK_OUTPUT_SCHEMA = toOpenApi(bookSchema, 'output');
export const BOOK_DRAFT_INPUT_SCHEMA = toOpenApi(bookDraftSchema, 'input');
export const BOOK_UPDATE_INPUT_SCHEMA = toOpenApi(updateBookSchema, 'input');

export const VALIDATION_ERROR_SCHEMA = {
  type: 'object',
  properties: {
    errors: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          msg: { type: 'string' },
          param: { type: 'string' },
          location: { type: 'string' },
        },
      },
    },
  },
} as const;

export const ACCESS_TOKEN_SCHEMA = {
  type: 'object',
  properties: {
    accessToken: { type: 'string' },
    user: { type: 'object', additionalProperties: true },
  },
} as const;
