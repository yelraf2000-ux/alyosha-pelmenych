import { normalizePhone, normalizeTelegram } from '@alyosha/shared';
import { t } from '../i18n';

// The same rules the API applies, so the form and the server never disagree.
export { normalizePhone, normalizeTelegram };

export function validateName(value: string): string | null {
  return value.trim().length >= 2 ? null : t.form.errors.name;
}

export function validatePhone(value: string): string | null {
  return normalizePhone(value) ? null : t.form.errors.phone;
}

export function validateTelegram(value: string): string | null {
  if (!value.trim()) return null;
  return normalizeTelegram(value) ? null : t.form.errors.telegram;
}
