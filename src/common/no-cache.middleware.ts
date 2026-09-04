import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * Ersatz für den json-server-no-cache-Helfer: setzt `Cache-Control: no-cache`
 * auf dynamische Antworten. Statische Cover-Dateien werden nicht erfasst
 * (Middleware wird nur auf /books, /users, /dev gebunden).
 */
@Injectable()
export class NoCacheMiddleware implements NestMiddleware {
  use(_req: Request, res: Response, next: NextFunction): void {
    res.setHeader('Cache-Control', 'no-cache');
    next();
  }
}
