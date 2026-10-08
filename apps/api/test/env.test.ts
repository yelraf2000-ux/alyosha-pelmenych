import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { decodePasswordHash } from '../src/env';

describe('ADMIN_PASSWORD_HASH', () => {
  const hash = bcrypt.hashSync('some-password', 4);

  it('is accepted as a plain bcrypt hash or as base64 of one', () => {
    expect(decodePasswordHash(hash)).toBe(hash);
    expect(decodePasswordHash(Buffer.from(hash).toString('base64'))).toBe(hash);
  });

  it('leaves anything else untouched, so validation can reject it', () => {
    expect(decodePasswordHash('not-a-hash')).toBe('not-a-hash');
    expect(decodePasswordHash(Buffer.from('still not a hash').toString('base64'))).not.toMatch(/^\$2/);
  });
});
