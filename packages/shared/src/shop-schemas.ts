// Server-side validation of what the storefront sends (SPEC §6).

import { z } from 'zod';
import {
  CUSTOM_MAX_GRAMS,
  CUSTOM_MIN_GRAMS,
  CUSTOM_NAME_MAX,
  CUSTOM_STEP_GRAMS,
  DELIVERY_METHODS,
  normalizePhone,
  normalizeTelegram,
} from './shop';

const phoneSchema = z
  .string()
  .max(40)
  .transform((value, ctx) => {
    const phone = normalizePhone(value);
    if (!phone) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid phone' });
      return z.NEVER;
    }
    return phone;
  });

const telegramSchema = z
  .string()
  .max(40)
  .nullish()
  .transform((value, ctx) => {
    if (!value || !value.trim()) return null;
    const username = normalizeTelegram(value);
    if (!username) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid telegram username' });
      return z.NEVER;
    }
    return username;
  });

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((value) => value?.trim() || null);

const nameSchema = z.string().trim().min(2).max(80);

export const orderInputSchema = z
  .object({
    customerName: nameSchema,
    customerPhone: phoneSchema,
    customerTelegram: telegramSchema,
    comment: optionalText(500),
    deliveryMethod: z.enum(DELIVERY_METHODS),
    deliveryAddress: optionalText(200),
    website: z.string().max(0).optional(),
    items: z
      .array(
        z.object({
          productId: z.number().int().positive(),
          qty: z.number().int().min(1).max(999),
        }),
      )
      .min(1)
      .max(50),
  })
  .superRefine((order, ctx) => {
    if (order.deliveryMethod === 'courier' && !order.deliveryAddress) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['deliveryAddress'], message: 'address required for courier' });
    }
  });

export type ValidOrder = z.output<typeof orderInputSchema>;

export const stockRequestSchema = z.object({
  productId: z.number().int().positive(),
  name: nameSchema,
  phone: phoneSchema,
  telegram: telegramSchema,
});

export type ValidStockRequest = z.output<typeof stockRequestSchema>;

const optionSchema = z.string().trim().min(1).max(80);

/**
 * A «Свой рецепт» request. Whether the chosen options are ones the shop offers is checked by the
 * API against its settings; here only the shape and the weight.
 */
export const customOrderSchema = z.object({
  recipeName: z.string().trim().min(1).max(CUSTOM_NAME_MAX),
  base: optionSchema,
  modifiers: z.array(optionSchema).max(40),
  spices: z.array(optionSchema).max(40),
  weightGrams: z
    .number()
    .int()
    .min(CUSTOM_MIN_GRAMS)
    .max(CUSTOM_MAX_GRAMS)
    .refine((grams) => grams % CUSTOM_STEP_GRAMS === 0, 'weight must be a whole number of steps'),
  customerName: nameSchema,
  customerPhone: phoneSchema,
  customerTelegram: telegramSchema,
  comment: optionalText(500),
  website: z.string().max(0).optional(),
});

export type ValidCustomOrder = z.output<typeof customOrderSchema>;
