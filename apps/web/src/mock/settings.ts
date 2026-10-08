import type { Settings } from '../types';

// Settings for the static demo build. They mirror the real seed (apps/api/src/db/seed.ts).

export const MOCK_SETTINGS: Settings = {
  heroTitle: 'Домашние пельмени ручной лепки', // TODO_CLIENT: our wording, to be approved
  heroSubtitle: 'Пельмени, манты и хинкали. Лепим в Ереване.', // TODO_CLIENT: our wording, to be approved
  aboutText:
    'PLACEHOLDER: здесь будет рассказ о вас — кто лепит, из чего и почему это вкусно.\n\n' +
    'PLACEHOLDER: второй абзац — два-три предложения о том, как всё начиналось.', // TODO_CLIENT
  deliveryText: 'После оформления заказа мы сами свяжемся с вами и уточним детали.',
  contactsText: 'Работаем каждый день с 11:00 до 22:00, без выходных.',
  pickupAddress: 'Ереван, проспект Тигран Мец, 59',
  courierFeeAmd: 1000, // TODO_CLIENT: the fee below the free threshold is not known yet
  freeDeliveryFromAmd: 20000,
  deliveryNote: '',
  phonePublic: '+374 55 443639',
  telegramPublic: 'apelmenych',
  instagramUrl: 'https://www.instagram.com/bbllbbd',
  tiktokUrl: 'https://www.tiktok.com/@bbllbbd',
};
