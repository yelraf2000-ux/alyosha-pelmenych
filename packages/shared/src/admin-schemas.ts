// Validation of what the admin panel sends (SPEC §7).

import { z } from 'zod';
import { ORDER_STATUSES } from './admin';
import { DELIVERY_METHODS, normalizeTelegram, PRODUCT_BADGE_MAX_LENGTH, PRODUCT_BADGES_MAX } from './shop';
import { nameSchema, optionalText, phoneSchema, telegramSchema } from './shop-schemas';

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
  /** The slug of a category; the API checks that there is one. */
  category: z.string().trim().min(1).max(80),
  priceAmd: z.number().int().min(0).max(10_000_000),
  weightLabel: z.string().trim().max(40),
  stockQty: z.number().int().min(0).max(100_000),
  isNew: z.boolean(),
  /** The owner's own labels; repeats and empty ones are dropped. */
  badges: z
    .array(z.string().trim().max(PRODUCT_BADGE_MAX_LENGTH))
    .max(PRODUCT_BADGES_MAX * 2)
    .transform((badges) => [...new Set(badges.filter(Boolean))])
    .refine((badges) => badges.length <= PRODUCT_BADGES_MAX),
  isActive: z.boolean(),
};

export const productCreateSchema = z.object({
  ...productFields,
  slug: productFields.slug.or(z.literal('')).optional(),
  description: productFields.description.optional(),
  weightLabel: productFields.weightLabel.optional(),
  stockQty: productFields.stockQty.optional(),
  isNew: productFields.isNew.optional(),
  badges: productFields.badges.optional(),
  isActive: productFields.isActive.optional(),
});
export type ProductCreate = z.output<typeof productCreateSchema>;

export const productPatchSchema = z.object(productFields).partial();
export type ProductPatch = z.output<typeof productPatchSchema>;

export const categoryNameSchema = z.object({ name: z.string().trim().min(1).max(40) });

export const reorderSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(1000),
});

export const orderStatusSchema = z.object({ status: z.enum(ORDER_STATUSES) });
export const loginSchema = z.object({ password: z.string().min(1).max(200) });

/** The shortest admin password the shop accepts. */
export const ADMIN_PASSWORD_MIN_LENGTH = 10;
/** How long a link for setting a new admin password works. */
export const ADMIN_PASSWORD_RESET_MINUTES = 15;

/** The new password, with the secret from the link the bot sent. */
export const passwordResetSchema = z.object({
  token: z.string().min(20).max(100),
  password: z.string().min(ADMIN_PASSWORD_MIN_LENGTH).max(200),
});

const longText = z.string().trim().max(5000);
/** A message of the bot; empty brings back the shop's own wording. */
const botText = z.string().trim().max(1000);
const shortText = z.string().trim().max(200);
const amd = z.number().int().min(0).max(10_000_000);

const httpsLinkOrEmpty = z
  .string()
  .trim()
  .max(200)
  .refine((value) => value === '' || /^https:\/\/[^\s]+$/.test(value), 'must be an https link or empty');

/** A Telegram username, stored without @; empty is allowed. */
const telegramUsernameOrEmpty = z
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
  });

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
  telegramPublic: telegramUsernameOrEmpty,
  instagramUrl: httpsLinkOrEmpty,
  tiktokUrl: httpsLinkOrEmpty,
  telegramContact: telegramUsernameOrEmpty,
  customBases: longText,
  customModifiers: longText,
  customSpices: longText,
  preorderEnabled: z.boolean(),
  preorderNote: shortText,
  botOrderReceived: botText,
  botOrderConfirmed: botText,
  botOrderDone: botText,
  botOrderCancelled: botText,
  botRecipeReceived: botText,
  botRecipeConfirmed: botText,
  botRecipeDone: botText,
  botRecipeCancelled: botText,
});

/**
 * The owner's changes to an order: who it is for, how it is delivered, and what is in it. The
 * items are the whole new list; a product left out is taken out of the order.
 */
export const orderEditSchema = z
  .object({
    customerName: nameSchema,
    customerPhone: phoneSchema,
    customerTelegram: telegramSchema,
    comment: optionalText(500),
    deliveryMethod: z.enum(DELIVERY_METHODS),
    deliveryAddress: optionalText(200),
    items: z
      .array(z.object({ productId: z.number().int().positive(), qty: z.number().int().min(1).max(999) }))
      .min(1)
      .max(50),
  })
  .superRefine((order, ctx) => {
    if (order.deliveryMethod === 'courier' && !order.deliveryAddress) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['deliveryAddress'], message: 'address required for courier' });
    }
    const ids = order.items.map((item) => item.productId);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['items'], message: 'each product once' });
    }
  });
export type ValidOrderEdit = z.output<typeof orderEditSchema>;

/** The price the owner names for a «Свой рецепт» request; null takes it away again. */
export const customPriceSchema = z.object({ priceAmd: z.number().int().min(0).max(10_000_000).nullable() });
