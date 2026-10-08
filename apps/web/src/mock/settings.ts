import type { Settings } from '../types';

// PLACEHOLDER settings for the Phase 0 prototype. In v1 all of these are edited in the admin.
// TODO_CLIENT: every value below.

export const MOCK_SETTINGS: Settings = {
  heroTitle: 'Домашние пельмени ручной лепки', // TODO_CLIENT
  heroSubtitle: 'Пельмени, вареники и манты. Лепим в Ереване, привозим замороженными.', // TODO_CLIENT
  aboutText:
    'PLACEHOLDER: здесь будет рассказ о вас — кто лепит, из чего и почему это вкусно.\n\n' +
    'PLACEHOLDER: второй абзац — два-три предложения о том, как всё начиналось.',
  deliveryText:
    'PLACEHOLDER: здесь будут условия доставки и оплаты — как и когда привозим, как можно оплатить заказ.\n\n' +
    'После оформления заказа мы сами свяжемся с вами и уточним детали.',
  contactsText: 'PLACEHOLDER: когда вам удобнее писать и звонить, часы работы.',
  pickupAddress: 'PLACEHOLDER: адрес самовывоза, Ереван', // TODO_CLIENT
  courierFeeAmd: 1000, // TODO_CLIENT
  freeDeliveryFromAmd: 10000, // TODO_CLIENT
  deliveryNote: 'Заказы после 15:00 — на следующий день', // TODO_CLIENT (example from SPEC)
  phonePublic: '+374 00 000000', // TODO_CLIENT
  telegramPublic: 'TODO_CLIENT', // TODO_CLIENT: username without @
  instagramUrl: 'https://instagram.com/TODO_CLIENT', // TODO_CLIENT
};
