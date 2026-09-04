import {
  Body,
  Controller,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';

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
  register(@Body() body: Record<string, unknown>) {
    return this.auth.register(body);
  }

  @Post(['login', 'signin'])
  @HttpCode(200)
  @ApiBody(CREDENTIALS_BODY)
  login(@Body() body: Record<string, unknown>) {
    return this.auth.login(body);
  }

  @Put('users/:id')
  updateUserPut(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.auth.updateUser(id, body, true);
  }

  @Patch('users/:id')
  updateUserPatch(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.auth.updateUser(id, body, false);
  }
}
