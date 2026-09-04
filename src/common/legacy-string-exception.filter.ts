import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import type { Response } from 'express';

/**
 * Hält die historische Auth-Fehlerform am Leben: das Ist-`users.js` sendet
 * `res.status(400).jsonp('Incorrect password')` – der Body ist also ein
 * **blanker JSON-String**, kein Objekt.
 *
 * Der `AuthService` wirft `new BadRequestException('<wortlaut>')`, die Guards
 * `new UnauthorizedException('<wortlaut>')` / `new ForbiddenException('<wortlaut>')`.
 * Nest verpackt eine solche Ein-String-Exception zu
 * `{ statusCode, message: '<wortlaut>', error: '<status-label>' }` – also mit
 * `error`-Feld. Genau dann sendet dieser Filter nur den Wortlaut blank (wie das
 * Ist per `res.jsonp('...')`). `HttpException`s ohne `error`-Feld
 * (z. B. `new NotFoundException()`) behalten das Standard-Nest-JSON.
 */
@Catch(HttpException)
export class LegacyStringExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception.getStatus();
    const payload = exception.getResponse();

    if (typeof payload === 'string') {
      response.status(status).json(payload);
      return;
    }

    if (payload && typeof payload === 'object') {
      const record = payload as Record<string, unknown>;
      const message = record.message;
      if ('error' in record && typeof message === 'string') {
        response.status(status).json(message);
        return;
      }
    }

    response.status(status).json(payload);
  }
}
