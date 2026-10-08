import 'dotenv/config';
import { z } from 'zod';

/** An empty line in .env (`KEY=`) counts as not set. */
const optional = z
  .string()
  .optional()
  .transform((value) => value?.trim() || undefined);

const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

/**
 * ADMIN_PASSWORD_HASH may be the bcrypt hash itself or base64 of it. The base64 form has no `$`
 * signs, which Docker Compose would otherwise try to expand inside an .env file.
 */
export function decodePasswordHash(value: string): string {
  if (BCRYPT_HASH.test(value)) return value;
  const decoded = Buffer.from(value, 'base64').toString('utf8');
  return BCRYPT_HASH.test(decoded) ? decoded : value;
}

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  PORT: z.coerce.number().int().positive().default(3000),
  // Render tells every service its own public address in RENDER_EXTERNAL_URL.
  PUBLIC_BASE_URL: optional
    .transform((value) => value ?? process.env.RENDER_EXTERNAL_URL ?? 'http://localhost:5173')
    .pipe(z.string().url()),
  TELEGRAM_BOT_TOKEN: optional,
  TELEGRAM_CHAT_ID: optional,
  NODE_ENV: z.string().default('development'),
  /** bcrypt hash of the admin password; set it with `npm run admin:password`. */
  ADMIN_PASSWORD_HASH: optional
    .transform((value) => (value ? decodePasswordHash(value) : undefined))
    .refine((value) => !value || BCRYPT_HASH.test(value), 'ADMIN_PASSWORD_HASH is not a bcrypt hash; create it with `npm run admin:password`'),
  SESSION_SECRET: optional.refine((value) => !value || value.length >= 32, 'SESSION_SECRET must be at least 32 characters'),
  /** Where product photos are stored. Relative paths start from apps/api. */
  UPLOADS_DIR: z.string().default('uploads'),
  /** Built storefront to serve from the API itself (single-container hosting). Unset otherwise. */
  WEB_DIST_DIR: optional,
  TRUST_PROXY: z
    .string()
    .optional()
    .transform((value) => value === '1' || value === 'true'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Invalid environment:\n${problems}\nSee apps/api/.env.example.`);
  }
  return parsed.data;
}
