import { Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DatabaseService } from '../database/database.service';

@ApiTags('dev')
@Controller('dev')
export class DevController {
  constructor(private readonly db: DatabaseService) {}

  @Post('reset')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Setzt die Datenbank auf den Auslieferungsstand zurück (Workshop-Werkzeug).',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { ok: { type: 'boolean' } },
    },
  })
  reset(): { ok: true } {
    this.db.restoreSeed();
    return { ok: true };
  }
}
