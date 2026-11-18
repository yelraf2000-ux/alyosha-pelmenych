import { formatAmd, type IngredientUnit } from '@alyosha/shared';

// The warehouse counts in grams, millilitres and pieces. The owner buys and counts in kilograms
// and litres, and writes a composition in grams: each unit has a small and a big name.

export const UNITS: Record<IngredientUnit, { small: string; big: string; factor: number; label: string }> = {
  g: { small: 'г', big: 'кг', factor: 1000, label: 'Килограммы' },
  ml: { small: 'мл', big: 'л', factor: 1000, label: 'Литры' },
  pcs: { small: 'шт.', big: 'шт.', factor: 1, label: 'Штуки' },
};

const decimal = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 });

/** 4600 g → «4,6 кг»; 98 pcs → «98 шт.». */
export function formatStock(qty: number, unit: IngredientUnit): string {
  return `${decimal.format(qty / UNITS[unit].factor)} ${UNITS[unit].big}`;
}

/** 200 g → «200 г». */
export function formatSmall(qty: number, unit: IngredientUnit): string {
  return `${decimal.format(qty)} ${UNITS[unit].small}`;
}

/** The price of a kilogram, a litre or a piece: «5 000 ֏ за кг». */
export function formatUnitPrice(unitCostAmd: number, unit: IngredientUnit): string {
  return `${formatAmd(Math.round(unitCostAmd * UNITS[unit].factor))} за ${UNITS[unit].big}`;
}

/** «4,5» or «4.5» → 4.5; null for anything that is not a number. */
export function parseDecimal(value: string): number | null {
  const text = value.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  return Number(text);
}

/** A number to put back into an input: 4.6 → «4,6». */
export function decimalInput(value: number): string {
  return String(Math.round(value * 1000) / 1000).replace('.', ',');
}

/** How many of a product the shelf still has ingredients for, and which ingredient runs out first. */
export function enoughFor(
  composition: { ingredientId: number; qty: number }[],
  stock: Map<number, { name: string; stockQty: number }>,
): { count: number; limitedBy: string | null } {
  let count = Infinity;
  let limitedBy: string | null = null;
  for (const line of composition) {
    const ingredient = stock.get(line.ingredientId);
    const fits = Math.max(0, Math.floor((ingredient?.stockQty ?? 0) / line.qty));
    if (fits < count) {
      count = fits;
      limitedBy = ingredient?.name ?? null;
    }
  }
  return { count: Number.isFinite(count) ? count : 0, limitedBy };
}

/** «74 %» of the price is profit. */
export function marginText(profitAmd: number, priceAmd: number): string {
  return priceAmd > 0 ? `${Math.round((profitAmd / priceAmd) * 100)} %` : '—';
}
