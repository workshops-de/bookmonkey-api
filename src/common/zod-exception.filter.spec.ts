import type { ArgumentsHost } from '@nestjs/common';
import type { Response } from 'express';
import { ZodExceptionFilter } from './zod-exception.filter.js';
import { bookDraftSchema } from '../domain/index.js';

const makeHost = () => {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) as unknown as Response }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
};

describe('ZodExceptionFilter', () => {
  const filter = new ZodExceptionFilter();

  it('maps a raw ZodError to the historic { errors } shape', () => {
    const { host, status, json } = makeHost();
    const result = bookDraftSchema.safeParse({});
    expect(result.success).toBe(false);
    if (result.success) return;

    filter.catch(result.error, host);

    expect(status).toHaveBeenCalledWith(400);
    const body = json.mock.calls[0][0];
    expect(Object.keys(body.errors).sort()).toEqual(['isbn', 'title']);
    expect(body.errors.isbn).toEqual({
      msg: expect.any(String),
      param: 'isbn',
      location: 'body',
    });
  });

  it('keeps only the first issue per field', () => {
    const { host, json } = makeHost();
    const result = bookDraftSchema.safeParse({ isbn: 1, title: 2, currency: 'X' });
    if (result.success) throw new Error('expected failure');
    filter.catch(result.error, host);
    const body = json.mock.calls[0][0];
    expect(Object.keys(body.errors).sort()).toEqual(['currency', 'isbn', 'title']);
  });
});
