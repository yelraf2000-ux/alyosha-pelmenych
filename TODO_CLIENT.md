# TODO_CLIENT — what Алексей needs to provide

Everything below is a placeholder. In code it is marked `TODO_CLIENT` or `PLACEHOLDER`.
Products and site texts live in the database and are first filled from `apps/api/src/db/seed.ts`.
Алексей can now replace all of them himself in the admin panel at `/admin`: products with photos, prices and stock
under «Товары», every text, fee and contact under «Настройки».

## Brand

| What | Now | Where |
| --- | --- | --- |
| Original logo file (SVG, or PNG with a transparent background) | Round badge redrawn from the logo in the brand film | `apps/web/src/components/Logo.tsx` |
| Armenian line on the logo — confirm the spelling | «Ալյոշա Պելմենիչ», copied from `intro.html` | `apps/web/src/components/Logo.tsx` |
| Palette — approve the direction | Night indigo + glowing amber + cream, taken from the brand film and logo | `apps/web/src/styles/tokens.css` |
| OK to use the brand film on the site? | Hero background loop, «Смотреть историю» player, two frames on the home page | `apps/web/public/media/` |
| Tagline «Рецепт не с этой планеты» — OK as the site's line? | Taken from the film's end card | `apps/web/src/i18n/ru.ts` (`home.tagline`) |
| Favicon | Drawn dumpling | `apps/web/public/favicon.svg` |
| Domain (`pelmeni.am` or another `.am`) | Not chosen | — |

## Products — `apps/api/src/db/seed.ts`

The three seeded products are examples (the static demo build has six, in `apps/web/src/mock/products.ts`). For each real product we need:

- [ ] Name
- [ ] Category (пельмени / вареники / манты / другое)
- [ ] Description (composition, taste, how to cook)
- [ ] Weight or pack size (now `500 г` / `800 г`)
- [ ] Price in AMD (now 1 800 – 3 200 ֏, invented)
- [ ] Current stock
- [ ] Which ones are «Новинка»
- [ ] Photo (now a drawn `PLACEHOLDER` picture). Landscape 4:3, at least 1000 px wide, one product per photo

Seeded examples: Пельмени домашние, Вареники с картошкой, Манты.

## Site texts and settings — `apps/api/src/db/seed.ts`

| Setting | Now (placeholder) |
| --- | --- |
| Hero title | «Домашние пельмени ручной лепки» |
| Hero subtitle | «Пельмени, вареники и манты. Лепим в Ереване, привозим замороженными.» |
| «О нас» text | `PLACEHOLDER` (two short paragraphs) |
| «Доставка и оплата» text, including how buyers pay | `PLACEHOLDER` |
| «Контакты» text (working hours, when to call) | `PLACEHOLDER` |
| Pickup address | `PLACEHOLDER: адрес самовывоза, Ереван` |
| Courier fee | 1 000 ֏ (invented) |
| Free delivery from | 10 000 ֏ (invented) |
| Delivery note | «Заказы после 15:00 — на следующий день» (example from the spec) |
| Public phone | `+374 00 000000` |
| Public Telegram | `@TODO_CLIENT` |
| Instagram link | `https://instagram.com/TODO_CLIENT` |

## Telegram notifications

- [ ] Алексей creates a bot with @BotFather and sends the bot token
- [ ] He presses Start in that bot, so it is allowed to write to him; we then read his chat id
- Both go into the server's `.env` (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`); steps are in README, "Telegram bot". Until then order messages are only written to the API log.

## Admin password

- [ ] Алексей chooses the admin password; it is set on the server during deployment
  (README, "Admin password"). The development login is refused in production.

## Hosting

- [ ] Domain registered in Алексей's name, with its DNS A record pointed at the server
- [ ] VPS paid in Алексей's name: Ubuntu 24.04, 1 vCPU, 1 GB memory is enough
- [ ] Somewhere off the server to keep copies of the nightly backups

## Other

- [ ] Site description for search engines and link previews — `apps/web/index.html`
- [ ] Wording of the personal-data consent checkbox, if he wants it different — `apps/web/src/i18n/ru.ts` (`checkout.consent`)
- [ ] Delivery area: all of Yerevan, or only some districts? (affects the delivery text)

## For the developer (not the client)

- [ ] Footer credit link «Сайт сделан: Rafayel» — `apps/web/src/config.ts`
