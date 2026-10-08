-- Replace the «О нас» placeholder with Алексей's story, as he told it (he can edit it in the admin).
-- Only where the placeholder is still there, so a text he has written himself is never touched.
UPDATE "settings"
SET "value" =
  'Меня зовут Алексей, и пельмени я любил всегда. Ещё в детстве мы лепили их вместе с родителями.'
  || chr(10) || chr(10) ||
  'Несколько лет я работал поваром в общепите и видел, как многие стараются экономить на продуктах. А я люблю делать всё от души — как для себя. Поэтому захотел работать на себя и решил делать пельмени.'
  || chr(10) || chr(10) ||
  'Начинал ещё в Краснодаре, а потом переехал в Ереван и с новыми силами продолжил.'
WHERE "key" = 'about_text' AND "value" LIKE 'PLACEHOLDER:%';
--> statement-breakpoint
-- The line under the home page title now says the shop delivers. Only our own first wording is
-- replaced: a subtitle he has written himself stays.
UPDATE "settings"
SET "value" = 'Доставка по Еревану'
WHERE "key" = 'hero_subtitle' AND "value" = 'Пельмени, манты и хинкали. Лепим в Ереване.';
--> statement-breakpoint
-- The home page title, rebuilt from his own words. Again only where our first wording is still there.
UPDATE "settings"
SET "value" = 'Лепим от души, как для себя'
WHERE "key" = 'hero_title' AND "value" = 'Домашние пельмени ручной лепки';
--> statement-breakpoint
-- The sentence under the delivery block is gone too. Only our own wording is removed.
UPDATE "settings"
SET "value" = ''
WHERE "key" = 'delivery_text' AND "value" = 'После оформления заказа мы сами свяжемся с вами и уточним детали.';
--> statement-breakpoint
-- The working hours line, shortened. Only our own wording is changed.
UPDATE "settings"
SET "value" = 'Работаем каждый день с 11:00 до 22:00'
WHERE "key" = 'contacts_text' AND "value" = 'Работаем каждый день с 11:00 до 22:00, без выходных.';
