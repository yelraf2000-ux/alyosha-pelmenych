import type { Settings } from '@alyosha/shared';
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
} as const satisfies Record<keyof Settings, string>;

function toAmd(value: string | undefined): number {
  const amount = Number.parseInt(value ?? '', 10);
  return Number.isFinite(amount) && amount >= 0 ? amount : 0;
}

export async function getSettings(db: Db | Tx): Promise<Settings> {
  const rows = await db.select().from(settings);
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  const text = (key: keyof Settings) => byKey.get(SETTING_KEYS[key]) ?? '';

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
