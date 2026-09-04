import { applyDecorators } from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';

/**
 * Bündelt die dokumentierten json-server-Query-Parameter für `GET /books`
 * und `GET /users/:id/books`.
 */
export const ApiBookQuery = () =>
  applyDecorators(
    ApiQuery({ name: '_page', required: false, type: Number, description: 'Seite (1-basiert). Aktiviert Pagination inkl. X-Total-Count / Link.' }),
    ApiQuery({ name: '_limit', required: false, type: Number, description: 'Seitengröße (Default 10 bei _page).' }),
    ApiQuery({ name: '_sort', required: false, type: String, description: 'Sortierfeld(er), kommagetrennt.' }),
    ApiQuery({ name: '_order', required: false, type: String, description: 'asc | desc, kommagetrennt parallel zu _sort.' }),
    ApiQuery({ name: '_start', required: false, type: Number, description: 'Slice-Start (alternativ zu _page).' }),
    ApiQuery({ name: '_end', required: false, type: Number, description: 'Slice-Ende (exklusiv).' }),
    ApiQuery({ name: 'q', required: false, type: String, description: 'Volltextsuche über alle Felder.' }),
    ApiQuery({
      name: 'filter',
      required: false,
      type: String,
      description:
        'Zusätzlich: exakte Feld-Filter (?author=…), Operatoren ?feld_gte= / _lte= / _ne= / _like= und Mehrfachwerte (?id=a&id=b → OR).',
    }),
  );
