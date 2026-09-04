import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { DatabaseService, UserRecord } from '../database/database.service.js';
import {
  EMAIL_REGEX,
  MIN_PASSWORD_LENGTH,
  SALT_LENGTH,
} from '../domain/index.js';

export interface AuthResponse {
  accessToken: string;
  user: UserRecord;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
  ) {}

  private requireCredentials(email?: string, password?: string): void {
    if (!email || !email.trim() || !password || !password.trim()) {
      throw new BadRequestException('Email and password are required');
    }
  }

  private nextUserId(): number {
    return (
      Math.max(0, ...this.db.users.map((u) => Number(u.id))) + 1
    );
  }

  private async sign(user: UserRecord): Promise<string> {
    return this.jwt.signAsync(
      { email: user.email },
      { subject: String(user.id) },
    );
  }

  async register(body: Record<string, unknown>): Promise<AuthResponse> {
    const { email, password, ...rest } = body as {
      email?: string;
      password?: string;
      [k: string]: unknown;
    };

    this.requireCredentials(email, password);

    if (email && !email.match(EMAIL_REGEX)) {
      throw new BadRequestException('Email format is invalid');
    }
    if (password && password.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException('Password is too short');
    }
    if (this.db.users.find((u) => u.email === email)) {
      throw new BadRequestException('Email already exists');
    }

    const hash = await bcrypt.hash(password as string, SALT_LENGTH);
    const user: UserRecord = {
      id: this.nextUserId(),
      email: email as string,
      password: hash,
      ...rest,
    };
    this.db.users.push(user);
    this.db.commit();

    const accessToken = await this.sign(user);
    return { accessToken, user };
  }

  async login(body: Record<string, unknown>): Promise<AuthResponse> {
    const { email, password } = body as {
      email?: string;
      password?: string;
    };

    this.requireCredentials(email, password);

    const user = this.db.users.find((u) => u.email === email);
    if (!user) {
      throw new BadRequestException('Cannot find user');
    }

    const same = await bcrypt.compare(password as string, user.password);
    if (!same) {
      throw new BadRequestException('Incorrect password');
    }

    const accessToken = await this.sign(user);
    return { accessToken, user };
  }

  async updateUser(
    id: string,
    body: Record<string, unknown>,
    replace: boolean,
  ): Promise<UserRecord> {
    const index = this.db.users.findIndex(
      (u) => Number(u.id) === Number(id),
    );
    if (index === -1) {
      throw new NotFoundException();
    }
    const existing = this.db.users[index];

    const next = { ...body };
    if (typeof next.password === 'string' && next.password) {
      next.password = await bcrypt.hash(next.password, SALT_LENGTH);
    }

    const updated: UserRecord = replace
      ? ({ ...(next as Record<string, unknown>), id: existing.id } as UserRecord)
      : ({ ...existing, ...(next as Record<string, unknown>), id: existing.id } as UserRecord);

    this.db.users[index] = updated;
    this.db.commit();
    return updated;
  }
}
