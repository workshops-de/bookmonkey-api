import { PipeTransform } from '@nestjs/common';
import type { ZodType, infer as ZodInfer } from 'zod';

/**
 * Winzige Body-Validierungs-Pipe: parst gegen ein Zod-Schema und wirft bei
 * Fehler den **rohen `ZodError`**, den der `ZodExceptionFilter` auf die
 * historische `{ errors: { … } }`-Form abbildet.
 *
 *   @Body(new ZodValidationPipe(bookDraftSchema)) draft: BookDraft
 */
export class ZodValidationPipe<T extends ZodType> implements PipeTransform {
  constructor(private readonly schema: T) {}

  transform(value: unknown): ZodInfer<T> {
    return this.schema.parse(value) as ZodInfer<T>;
  }
}
