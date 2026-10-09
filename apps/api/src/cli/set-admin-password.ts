// `npm run admin:password` — asks for a new admin password and writes its bcrypt hash
// (and a SESSION_SECRET, if there is none yet) into apps/api/.env.
// The password itself is never stored or printed. Restart the API afterwards.
//
// With --print nothing is written: the ADMIN_PASSWORD_HASH line is printed instead, to be pasted
// into the server's .env. That is how the password is set for the Docker deployment (see README).

import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stdin, stdout } from 'node:process';
import { ADMIN_PASSWORD_MIN_LENGTH as MIN_LENGTH } from '@alyosha/shared';
import { hashPassword } from '../auth';

const envPath = resolve('.env');
const printOnly = process.argv.includes('--print');

/** Reads one line without showing what is typed. */
function askHidden(question: string): Promise<string> {
  return new Promise((done, fail) => {
    stdout.write(question);
    if (!stdin.isTTY) {
      // Piped input (e.g. from a deploy script): read the first line as is.
      let data = '';
      stdin.setEncoding('utf8');
      stdin.on('data', (chunk) => (data += chunk));
      stdin.on('end', () => done(data.split(/\r?\n/)[0] ?? ''));
      return;
    }
    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (key: string) => {
      for (const char of key) {
        if (char === '\r' || char === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          stdout.write('\n');
          return done(value);
        }
        if (char === '\u0003') return fail(new Error('Cancelled.'));
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else value += char;
      }
    };
    stdin.on('data', onData);
  });
}

function setEnvLine(content: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  // A function replacement keeps the `$` signs of a bcrypt hash literal.
  if (pattern.test(content)) return content.replace(pattern, () => line);
  return `${content.replace(/\s*$/, '')}\n${line}\n`;
}

const password = await askHidden(`New admin password (at least ${MIN_LENGTH} characters): `);
if (password.length < MIN_LENGTH) {
  console.error(`Too short: the password needs at least ${MIN_LENGTH} characters. Nothing was changed.`);
  process.exit(1);
}
if (stdin.isTTY) {
  const again = await askHidden('Repeat it: ');
  if (again !== password) {
    console.error('The two passwords are different. Nothing was changed.');
    process.exit(1);
  }
}

// Stored as base64: a raw bcrypt hash is full of `$`, which Docker Compose expands in .env files.
const encodedHash = Buffer.from(await hashPassword(password)).toString('base64');

if (printOnly) {
  console.log();
  console.log('Replace the ADMIN_PASSWORD_HASH line in .env with this one, then run: docker compose up -d');
  console.log();
  console.log(`ADMIN_PASSWORD_HASH=${encodedHash}`);
  process.exit(0);
}

let content = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
content = setEnvLine(content, 'ADMIN_PASSWORD_HASH', encodedHash);
const currentSecret = /^SESSION_SECRET=(.*)$/m.exec(content)?.[1]?.trim() ?? '';
if (!currentSecret || currentSecret.startsWith('dev-only')) {
  content = setEnvLine(content, 'SESSION_SECRET', randomBytes(32).toString('hex'));
}
writeFileSync(envPath, content);

console.log(`Saved to ${envPath}. Restart the API; everyone who was signed in to the admin is signed out.`);
