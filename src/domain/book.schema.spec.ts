import { bookDraftSchema, updateBookSchema } from './book.schema.js';

describe('bookDraftSchema', () => {
  it('requires isbn and title', () => {
    const r = bookDraftSchema.safeParse({});
    expect(r.success).toBe(false);
    if (r.success) return;
    const fields = r.error.issues.map((i) => i.path[0]);
    expect(fields).toEqual(expect.arrayContaining(['isbn', 'title']));
  });

  it('defaults currency to EUR', () => {
    const r = bookDraftSchema.parse({ isbn: 'i', title: 't' });
    expect(r.currency).toBe('EUR');
  });

  it('rejects an unknown currency', () => {
    const r = bookDraftSchema.safeParse({ isbn: 'i', title: 't', currency: 'XXX' });
    expect(r.success).toBe(false);
  });

  it('rejects a non-number / negative price', () => {
    expect(
      bookDraftSchema.safeParse({ isbn: 'i', title: 't', price: '9' }).success,
    ).toBe(false);
    expect(
      bookDraftSchema.safeParse({ isbn: 'i', title: 't', price: -1 }).success,
    ).toBe(false);
  });

  it('accepts a plain date and an offset datetime for publishedAt, and null', () => {
    expect(
      bookDraftSchema.safeParse({ isbn: 'i', title: 't', publishedAt: '2020-01-01' })
        .success,
    ).toBe(true);
    expect(
      bookDraftSchema.safeParse({
        isbn: 'i',
        title: 't',
        publishedAt: '2020-01-01T12:00:00+02:00',
      }).success,
    ).toBe(true);
    expect(
      bookDraftSchema.safeParse({ isbn: 'i', title: 't', publishedAt: null })
        .success,
    ).toBe(true);
    expect(
      bookDraftSchema.safeParse({ isbn: 'i', title: 't', publishedAt: 'nope' })
        .success,
    ).toBe(false);
  });
});

describe('server-managed timestamps', () => {
  it('strips a client-supplied createdAt / updatedAt from the draft', () => {
    const r = bookDraftSchema.safeParse({
      isbn: 'i',
      title: 't',
      createdAt: '2020-01-01T00:00:00+00:00',
      updatedAt: '2020-01-01T00:00:00+00:00',
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).not.toHaveProperty('createdAt');
    expect(r.data).not.toHaveProperty('updatedAt');
  });

  it('are also stripped from a PATCH body', () => {
    const r = updateBookSchema.safeParse({
      title: 't',
      createdAt: '2020-01-01T00:00:00+00:00',
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).not.toHaveProperty('createdAt');
  });
});

describe('updateBookSchema (.partial())', () => {
  it('allows an empty patch and does NOT inject the currency default', () => {
    const r = updateBookSchema.parse({});
    expect(r).not.toHaveProperty('currency');
  });

  it('still validates a supplied currency literal', () => {
    expect(updateBookSchema.safeParse({ currency: 'GBP' }).success).toBe(true);
    expect(updateBookSchema.safeParse({ currency: 'nope' }).success).toBe(false);
  });
});
