export { formatAmd } from '@alyosha/shared';

/** Russian plural: plural(2, ['товар', 'товара', 'товаров']) → "товара". */
export function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

export function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function telHref(phone: string): string {
  return 'tel:' + phone.replace(/[^\d+]/g, '');
}
