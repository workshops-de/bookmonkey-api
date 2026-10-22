import {
  Body,
  Controller,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  ACCESS_TOKEN_SCHEMA,
  USER_SCHEMA,
  LEGACY_ERROR_SCHEMA,
} from '../common/openapi.js';
import { AuthService } from './auth.service.js';

const CREDENTIALS_BODY = {
  schema: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: { type: 'string' },
      password: { type: 'string' },
    },
  },
};

// Auth ist ein reines Workshop-/Test-Werkzeug: `register`/`login` geben ein JWT
// aus, aber KEIN Endpunkt verlangt ein Token (wie im Ist-Server).
@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post(['users', 'register', 'signup'])
  @HttpCode(201)
  @ApiBody(CREDENTIALS_BODY)
  @ApiCreatedResponse({ schema: ACCESS_TOKEN_SCHEMA })
  @ApiResponse({ status: 400, schema: LEGACY_ERROR_SCHEMA })
  register(@Body() body: Record<string, unknown>) {
    return this.auth.register(body);
  }

  @Post(['login', 'signin'])
  @HttpCode(200)
  @ApiBody(CREDENTIALS_BODY)
  @ApiOkResponse({ schema: ACCESS_TOKEN_SCHEMA })
  @ApiResponse({ status: 400, schema: LEGACY_ERROR_SCHEMA })
  login(@Body() body: Record<string, unknown>) {
    return this.auth.login(body);
  }

  @Put('users/:id')
  @ApiOkResponse({ schema: USER_SCHEMA })
  @ApiResponse({ status: 404, description: 'User not found' })
  updateUserPut(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.auth.updateUser(id, body, true);
  }

  @Patch('users/:id')
  @ApiOkResponse({ schema: USER_SCHEMA })
  @ApiResponse({ status: 404, description: 'User not found' })
  updateUserPatch(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.auth.updateUser(id, body, false);
  }
}
