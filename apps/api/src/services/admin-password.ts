import { ADMIN_PASSWORD_RESET_MINUTES } from '@alyosha/shared';
import { and, eq, gt } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { hashPassword, type AdminAuth } from '../auth';
import type { Db } from '../db/client';
import { adminPassword } from '../db/schema';

/**
 * A forgotten admin password, replaced by the owner himself.
 *
 * He sends /password in an admin chat of the Telegram bot; the bot answers with a link that works
 * once and for a short time; the page behind it asks for a new password. Being in an admin chat is
 * the proof that it is him: those chats already confirm and cancel orders.
 *
 * A password set this way lives in the database and takes the place of ADMIN_PASSWORD_HASH. The
 * variable stays the way back in: once somebody changes it, it wins again (see `fingerprint`).
 */

const ROW = 1;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/**
 * Which ADMIN_PASSWORD_HASH a stored password was set under. A stored password is only used while
 * the variable is still that one: a new value in the variable means somebody reset the password
 * on the server on purpose, and that must work even with a password of the bot's in the way.
 */
const fingerprint = (auth: AdminAuth) => sha256(auth.configuredHash);

/** At start: the password set through the bot, if there is one, replaces the one from the environment. */
export async function applyStoredPassword(db: Db, auth: AdminAuth): Promise<void> {
  const [row] = await db.select().from(adminPassword).where(eq(adminPassword.id, ROW));
  if (!row?.passwordHash) return;
  if (row.configuredFingerprint === fingerprint(auth)) {
    auth.passwordHash = row.passwordHash;
    return;
  }
  await db
    .update(adminPassword)
    .set({ passwordHash: null, configuredFingerprint: null, updatedAt: new Date() })
    .where(eq(adminPassword.id, ROW));
}

/**
 * Opens the way to a new password and returns the secret for the link. Only its hash is stored;
 * asking again makes the previous link useless.
 */
export async function startPasswordReset(db: Db, now = Date.now()): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const reset = {
    resetTokenHash: sha256(token),
    resetExpiresAt: new Date(now + ADMIN_PASSWORD_RESET_MINUTES * 60_000),
    updatedAt: new Date(now),
  };
  await db
    .insert(adminPassword)
    .values({ id: ROW, ...reset })
    .onConflictDoUpdate({ target: adminPassword.id, set: reset });
  return token;
}

/**
 * Sets the new password if `token` is the one from the latest link and still in time. From then
 * on only the new password signs in, and every device that was signed in is signed out (the
 * session cookies are signed with the password's hash). The link does not work a second time.
 */
export async function finishPasswordReset(
  db: Db,
  auth: AdminAuth,
  token: string,
  password: string,
  now = Date.now(),
): Promise<boolean> {
  const live = and(
    eq(adminPassword.id, ROW),
    eq(adminPassword.resetTokenHash, sha256(token)),
    gt(adminPassword.resetExpiresAt, new Date(now)),
  );
  // Looked up before the slow hashing below, so a guessed token costs the server nothing.
  const [found] = await db.select({ id: adminPassword.id }).from(adminPassword).where(live);
  if (!found) return false;

  const passwordHash = await hashPassword(password);
  const saved = await db
    .update(adminPassword)
    .set({
      passwordHash,
      configuredFingerprint: fingerprint(auth),
      resetTokenHash: null,
      resetExpiresAt: null,
      updatedAt: new Date(now),
    })
    .where(live)
    .returning({ id: adminPassword.id });
  // Empty when the same link was used twice at once: the first one won.
  if (saved.length === 0) return false;

  auth.passwordHash = passwordHash;
  return true;
}
