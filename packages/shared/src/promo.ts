// Promo codes: the owner makes them in the admin («Промокоды»), buyers type one at checkout.

import { z } from 'zod';
import { isIsoDate } from './admin';

/** A share of the price, or a fixed amount off. */
export const PROMO_KINDS = ['percent', 'amount'] as const;
export type PromoKind = (typeof PROMO_KINDS)[number];

/** Why a code did not work. */
export const PROMO_PROBLEMS = ['not_found', 'expired', 'used_up', 'not_applicable'] as const;
export type PromoProblem = (typeof PROMO_PROBLEMS)[number];

/** What decides the size of a code's discount. */
export interface PromoRule {
  kind: PromoKind;
  /** Percent (1–100) or whole AMD, by `kind`. */
  value: number;
  /** Category slugs the code works on. Empty together with `productIds`: every product. */
  categories: string[];
  productIds: number[];
}

/** A line of the cart as the discount sees it. */
export interface PromoLine {
  productId: number;
  category: string;
  priceAmd: number;
  qty: number;
}

/** Codes are typed by people: «pelmeni20 » and «PELMENI20» are the same code. */
export function normalizePromoCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function promoAppliesTo(rule: Pick<PromoRule, 'categories' | 'productIds'>, line: Pick<PromoLine, 'productId' | 'category'>): boolean {
  if (rule.categories.length === 0 && rule.productIds.length === 0) return true;
  return rule.productIds.includes(line.productId) || rule.categories.includes(line.category);
}

/**
 * The discount in whole AMD. It counts only the goods the code works on, rounds a percentage down,
 * and is never more than those goods cost. Delivery is never discounted.
 */
export function promoDiscount(rule: PromoRule, lines: readonly PromoLine[]): number {
  const eligible = lines.filter((line) => promoAppliesTo(rule, line)).reduce((sum, line) => sum + line.priceAmd * line.qty, 0);
  if (eligible === 0) return 0;
  const off = rule.kind === 'percent' ? Math.floor((eligible * rule.value) / 100) : rule.value;
  return Math.min(off, eligible);
}

/** «−20%» or «−1 000 ֏», for the admin's list. */
export function promoLabel(rule: Pick<PromoRule, 'kind' | 'value'>, formatAmd: (amd: number) => string): string {
  return rule.kind === 'percent' ? `−${rule.value}%` : `−${formatAmd(rule.value)}`;
}

// ---------- The buyer's side ----------

/** What the checkout sends to see whether a code works for the cart. */
export const promoCheckSchema = z.object({
  code: z.string().trim().min(1).max(40),
  items: z
    .array(z.object({ productId: z.number().int().positive(), qty: z.number().int().min(1).max(999) }))
    .min(1)
    .max(50),
});

export type PromoCheckResult =
  | { ok: true; code: string; discountAmd: number }
  | { ok: false; error: PromoProblem | 'invalid' | 'rate_limited' };

// ---------- The owner's side ----------

export const PROMO_CODE_MAX = 30;

export const promoCodeSchema = z
  .object({
    // Letters of any alphabet, digits, «-» and «_»: ПЕЛЬМЕНИ20 works as well as PELMENI20.
    code: z
      .string()
      .trim()
      .min(3)
      .max(PROMO_CODE_MAX)
      .regex(/^[\p{L}\p{N}_-]+$/u)
      .transform(normalizePromoCode),
    kind: z.enum(PROMO_KINDS),
    value: z.number().int().min(1).max(10_000_000),
    categories: z.array(z.string().trim().min(1).max(80)).max(50),
    productIds: z.array(z.number().int().positive()).max(500),
    /** How many orders may use it; null: no limit. Cancelled orders do not count. */
    maxUses: z.number().int().min(1).max(1_000_000).nullable(),
    /** The last day it works (YYYY-MM-DD, the shop's time zone); null: no end. */
    validUntil: z.string().refine(isIsoDate).nullable(),
    isActive: z.boolean(),
  })
  .superRefine((promo, ctx) => {
    if (promo.kind === 'percent' && promo.value > 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'a percentage is at most 100' });
    }
  });

export type PromoCodeInput = z.input<typeof promoCodeSchema>;
export type ValidPromoCode = z.output<typeof promoCodeSchema>;

/** A promo code as the owner sees it in the admin. */
export interface AdminPromoCode extends PromoRule {
  id: number;
  code: string;
  maxUses: number | null;
  validUntil: string | null;
  isActive: boolean;
  /** Orders placed with it, cancelled ones left out. */
  uses: number;
  /** The discount those orders got, in total. */
  discountGivenAmd: number;
  createdAt: string;
}
