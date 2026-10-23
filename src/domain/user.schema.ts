import { z } from 'zod';
import { EMAIL_REGEX, MIN_PASSWORD_LENGTH } from './constants.js';

/**
 * Optionaler Zucker. Die maßgeblichen Auth-Fehlertexte ("Email and password are
 * required", "Email format is invalid", "Password is too short", "Cannot find
 * user", "Incorrect password") wirft der `AuthService` selbst als
 * `BadRequestException(<string>)`, "Email already exists" als
 * `ConflictException(<string>)` (409); sie sind bereits englisch.
 */
export const userCredentialsSchema = z.object({
  email: z.string().regex(EMAIL_REGEX),
  password: z.string().min(MIN_PASSWORD_LENGTH),
});

export type UserCredentials = z.infer<typeof userCredentialsSchema>;
