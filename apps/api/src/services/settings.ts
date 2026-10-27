import { DEFAULT_BOT_TEXTS, DEFAULT_PREORDER_NOTE, type BotTextKey, type Settings } from '@alyosha/shared';
import type { Db, Tx } from '../db/client';
import { settings } from '../db/schema';

/** Column `settings.key` for every field of `Settings` (SPEC §5). */
export const SETTING_KEYS = {
  aboutText: 'about_text',
  deliveryText: 'delivery_text',
  contactsText: 'contacts_text',
  pickupAddress: 'pickup_address',
  courierFeeAmd: 'courier_fee_amd',
  freeDeliveryFromAmd: 'free_delivery_from_amd',
  deliveryNote: 'delivery_note',
  heroTitle: 'hero_title',
  heroSubtitle: 'hero_subtitle',
  phonePublic: 'phone_public',
  telegramPublic: 'telegram_public',
  instagramUrl: 'instagram_url',
  tiktokUrl: 'tiktok_url',
  telegramContact: 'telegram_contact',
  customBases: 'custom_bases',
  customModifiers: 'custom_modifiers',
  customSpices: 'custom_spices',
  preorderEnabled: 'preorder_enabled',
  preorderNote: 'preorder_note',
  botOrderReceived: 'bot_order_received',
  botOrderConfirmed: 'bot_order_confirmed',
  botOrderDone: 'bot_order_done',
  botOrderCancelled: 'bot_order_cancelled',
  botRecipeReceived: 'bot_recipe_received',
  botRecipeConfirmed: 'bot_recipe_confirmed',
  botRecipeDone: 'bot_recipe_done',
  botRecipeCancelled: 'bot_recipe_cancelled',
} as const satisfies Record<keyof Settings, string>;

function toAmd(value: string | undefined): number {
  const amount = Number.parseInt(value ?? '', 10);
  return Number.isFinite(amount) && amount >= 0 ? amount : 0;
}

export async function getSettings(db: Db | Tx): Promise<Settings> {
  const rows = await db.select().from(settings);
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  const text = (key: keyof Settings) => byKey.get(SETTING_KEYS[key]) ?? '';
  // Empty means "the shop's own wording": clearing a field in the admin brings it back.
  const botText = (key: BotTextKey) => text(key).trim() || DEFAULT_BOT_TEXTS[key];
  // On unless the owner switched it off.
  const preorder = byKey.get(SETTING_KEYS.preorderEnabled);

  return {
    aboutText: text('aboutText'),
    deliveryText: text('deliveryText'),
    contactsText: text('contactsText'),
    pickupAddress: text('pickupAddress'),
    courierFeeAmd: toAmd(byKey.get(SETTING_KEYS.courierFeeAmd)),
    freeDeliveryFromAmd: toAmd(byKey.get(SETTING_KEYS.freeDeliveryFromAmd)),
    deliveryNote: text('deliveryNote'),
    heroTitle: text('heroTitle'),
    heroSubtitle: text('heroSubtitle'),
    phonePublic: text('phonePublic'),
    telegramPublic: text('telegramPublic'),
    instagramUrl: text('instagramUrl'),
    tiktokUrl: text('tiktokUrl'),
    telegramContact: text('telegramContact'),
    customBases: text('customBases'),
    customModifiers: text('customModifiers'),
    customSpices: text('customSpices'),
    preorderEnabled: preorder !== 'false' && preorder !== '0',
    preorderNote: text('preorderNote').trim() || DEFAULT_PREORDER_NOTE,
    botOrderReceived: botText('botOrderReceived'),
    botOrderConfirmed: botText('botOrderConfirmed'),
    botOrderDone: botText('botOrderDone'),
    botOrderCancelled: botText('botOrderCancelled'),
    botRecipeReceived: botText('botRecipeReceived'),
    botRecipeConfirmed: botText('botRecipeConfirmed'),
    botRecipeDone: botText('botRecipeDone'),
    botRecipeCancelled: botText('botRecipeCancelled'),
  };
}

export async function saveSettings(db: Db, values: Settings): Promise<Settings> {
  await db.transaction(async (tx) => {
    for (const field of Object.keys(SETTING_KEYS) as (keyof Settings)[]) {
      const value = String(values[field]);
      await tx
        .insert(settings)
        .values({ key: SETTING_KEYS[field], value })
        .onConflictDoUpdate({ target: settings.key, set: { value } });
    }
  });
  return getSettings(db);
}
