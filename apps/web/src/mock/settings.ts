import type { Settings } from '../types';

// Settings for the static demo build. They mirror the real seed (apps/api/src/db/seed.ts).

export const MOCK_SETTINGS: Settings = {
  heroTitle: 'Лепим от души, как для себя', // TODO_CLIENT: built from his own words; he should approve it
  heroSubtitle: 'Доставка по Еревану', // TODO_CLIENT: the delivery area is not confirmed yet
  // TODO_CLIENT: his own story as he told it in the chat, tidied up by us. He should read the wording.
  aboutText:
    'Меня зовут Алексей, и пельмени я любил всегда. Ещё в детстве мы лепили их вместе с родителями.\n\n' +
    'Несколько лет я работал поваром в общепите и видел, как многие стараются экономить на продуктах. А я люблю делать всё от души — как для себя. Поэтому захотел работать на себя и решил делать пельмени.\n\n' +
    'Начинал ещё в Краснодаре, а потом переехал в Ереван и с новыми силами продолжил.',
  deliveryText: '',
  contactsText: 'Работаем каждый день с 11:00 до 22:00',
  pickupAddress: 'Ереван, проспект Тигран Мец, 59',
  courierFeeAmd: 0, // no fixed price: «+ доставка», paid to the courier separately (TODO_CLIENT: his price, if he has one)
  freeDeliveryFromAmd: 20000,
  deliveryNote: '',
  phonePublic: '+374 55 443639',
  telegramPublic: 'apelmenych',
  instagramUrl: 'https://www.instagram.com/bbllbbd',
  tiktokUrl: 'https://www.tiktok.com/@bbllbbd',
};
