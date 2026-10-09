import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { decodePasswordHash } from '../src/env';
import { adminChatIdsFromEnv } from '../src/telegram';

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

describe('TELEGRAM_CHAT_ID', () => {
  it('takes several admins from one variable, from several, or from both', () => {
    expect(adminChatIdsFromEnv({ TELEGRAM_CHAT_ID: '111' })).toEqual([111]);
    expect(adminChatIdsFromEnv({ TELEGRAM_CHAT_ID: '111, 222 ,-100333' })).toEqual([111, 222, -100333]);
    expect(adminChatIdsFromEnv({ TELEGRAM_CHAT_ID: '111', TELEGRAM_CHAT_ID2: '222' })).toEqual([111, 222]);
    expect(adminChatIdsFromEnv({ TELEGRAM_CHAT_ID_ALEKSEY: '222', TELEGRAM_CHAT_ID: '111,222' })).toEqual([111, 222]);
  });

  it('ignores what is not a chat number, and other variables', () => {
    expect(adminChatIdsFromEnv({ TELEGRAM_CHAT_ID: '', TELEGRAM_CHAT_ID2: 'abc, 12.5, ' })).toEqual([]);
    expect(adminChatIdsFromEnv({ TELEGRAM_BOT_TOKEN: '123456', DATABASE_URL: '777' })).toEqual([]);
    expect(adminChatIdsFromEnv({})).toEqual([]);
  });
});
