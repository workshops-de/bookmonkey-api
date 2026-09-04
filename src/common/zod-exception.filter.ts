import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import * as z from 'zod';

interface FieldError {
  msg: string;
  param: string;
  location: 'body';
}

/**
 * Bildet einen rohen `ZodError` (aus `ZodValidationPipe`) auf die historische
 * Contract-Form ab, die früher `middlewares/book-validation.js` erzeugt hat:
 *
 *   { "errors": { "isbn": { "msg": "…", "param": "isbn", "location": "body" } } }
 *
 * Pro Feld wird der **erste** Issue behalten.
 */
@Catch(z.core.$ZodError)
export class ZodExceptionFilter implements ExceptionFilter {
  catch(exception: z.core.$ZodError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    const errors: Record<string, FieldError> = {};
    for (const issue of exception.issues as z.core.$ZodIssue[]) {
      const field = String(issue.path[0] ?? '_');
      if (errors[field]) continue;
      errors[field] = {
        msg: issue.message,
        param: field,
        location: 'body'
      };
    }

    response.status(400).json({ errors });
  }
}
