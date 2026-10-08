// Validation of what the admin panel sends (SPEC §7).

import { z } from 'zod';
import { ORDER_STATUSES, STOCK_REQUEST_STATUSES } from './admin';
import { CATEGORIES, normalizeTelegram } from './shop';

const productFields = {
  name: z.string().trim().min(1).max(120),
  /** Part of the product URL. Left empty, it is made from the name. */
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().max(5000),
  category: z.enum(CATEGORIES),
  priceAmd: z.number().int().min(0).max(10_000_000),
  weightLabel: z.string().trim().max(40),
  stockQty: z.number().int().min(0).max(100_000),
  isNew: z.boolean(),
  isActive: z.boolean(),
};

export const productCreateSchema = z.object({
  ...productFields,
  slug: productFields.slug.or(z.literal('')).optional(),
  description: productFields.description.optional(),
  weightLabel: productFields.weightLabel.optional(),
  stockQty: productFields.stockQty.optional(),
  isNew: productFields.isNew.optional(),
  isActive: productFields.isActive.optional(),
});
export type ProductCreate = z.output<typeof productCreateSchema>;

export const productPatchSchema = z.object(productFields).partial();
export type ProductPatch = z.output<typeof productPatchSchema>;

export const reorderSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(1000),
});

export const orderStatusSchema = z.object({ status: z.enum(ORDER_STATUSES) });
export const stockRequestStatusSchema = z.object({ status: z.enum(STOCK_REQUEST_STATUSES) });
export const loginSchema = z.object({ password: z.string().min(1).max(200) });

const longText = z.string().trim().max(5000);
const shortText = z.string().trim().max(200);
const amd = z.number().int().min(0).max(10_000_000);

export const settingsSchema = z.object({
  aboutText: longText,
  deliveryText: longText,
  contactsText: longText,
  pickupAddress: shortText,
  courierFeeAmd: amd,
  freeDeliveryFromAmd: amd,
  deliveryNote: shortText,
  heroTitle: shortText,
  heroSubtitle: shortText,
  phonePublic: z.string().trim().max(40),
  /** Username without @; empty hides the link. */
  telegramPublic: z
    .string()
    .trim()
    .max(40)
    .transform((value, ctx) => {
      if (!value) return '';
      const username = normalizeTelegram(value);
      if (!username) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid telegram username' });
        return z.NEVER;
      }
      return username;
    }),
  instagramUrl: z
    .string()
    .trim()
    .max(200)
    .refine((value) => value === '' || /^https:\/\/[^\s]+$/.test(value), 'must be an https link or empty'),
});
