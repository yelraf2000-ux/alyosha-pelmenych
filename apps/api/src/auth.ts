import bcrypt from 'bcryptjs';
import { createHmac, timingSafeEqual } from 'node:crypto';

// Single admin (SPEC §7): a bcrypt hash of the password in ADMIN_PASSWORD_HASH and a stateless,
// signed session cookie. There is no user table and no sign-up.

export const SESSION_COOKIE = 'ap_admin';
/** The owner works from his phone; a month between logins is comfortable. */
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * Password behind the hash in .env.example, for local development only.
 * The server refuses to start in production while this password is still active.
 */
export const DEV_ADMIN_PASSWORD = 'pelmeni-dev';

export interface AdminAuth {
  passwordHash: string;
  sessionSecret: string;
  /** Send the cookie over HTTPS only. On in production. */
  secureCookie: boolean;
}

// The password hash is mixed into the signing key, so changing the password
// (or SESSION_SECRET) signs everyone out.
function sign(auth: AdminAuth, payload: string): string {
  const key = createHmac('sha256', auth.sessionSecret).update(auth.passwordHash).digest();
  return createHmac('sha256', key).update(payload).digest('base64url');
}

export function createSessionToken(auth: AdminAuth, now = Date.now()): string {
  const expiresAt = Math.floor(now / 1000) + SESSION_TTL_SECONDS;
  return `${expiresAt}.${sign(auth, String(expiresAt))}`;
}

export function isValidSessionToken(auth: AdminAuth, token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [expiresAt, signature] = parts as [string, string];
  if (!/^\d{1,12}$/.test(expiresAt)) return false;

  const expected = Buffer.from(sign(auth, expiresAt));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;

  return Number(expiresAt) * 1000 > now;
}

export function checkPassword(auth: AdminAuth, password: string): Promise<boolean> {
  return bcrypt.compare(password, auth.passwordHash);
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}
