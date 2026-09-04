import { jest } from '@jest/globals';
import {
  BadRequestException,
  NotFoundException,
  type ArgumentsHost,
} from '@nestjs/common';
import type { Response } from 'express';
import { LegacyStringExceptionFilter } from './legacy-string-exception.filter';

const makeHost = () => {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) as unknown as Response }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
};

describe('LegacyStringExceptionFilter', () => {
  const filter = new LegacyStringExceptionFilter();

  it('sends a bare JSON string for BadRequestException(<string>)', () => {
    const { host, status, json } = makeHost();
    filter.catch(new BadRequestException('Incorrect password'), host);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith('Incorrect password');
  });

  it('leaves generic HttpExceptions as the standard object', () => {
    const { host, status, json } = makeHost();
    filter.catch(new NotFoundException(), host);
    expect(status).toHaveBeenCalledWith(404);
    const body = json.mock.calls[0][0];
    expect(typeof body).toBe('object');
    expect(body.statusCode).toBe(404);
  });
});
