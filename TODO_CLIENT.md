# TODO_CLIENT — what Алексей still needs to provide

On 8 Oct 2026 Алексей sent his price list, pickup address, free-delivery threshold, phone, links
and working hours. Those are now the shop's starting data (`apps/api/src/db/seed.ts`).
He changes everything himself in the admin panel at `/admin`: products, photos, prices and stock
under «Товары»; every text, fee and contact under «Настройки».

What is still a guess is marked `TODO_CLIENT` or `PLACEHOLDER` in the code and listed here.

## Already from the client

| What | Value |
| --- | --- |
| Products and prices | 5 пельмени (500 г), 2 манты (6 шт.), 2 хинкали (6 шт.), as in the price list |
| Pickup address | Ереван, проспект Тигран Мец, 59 |
| Free courier delivery from | 20 000 ֏ |
| Phone | +374 55 443639 |
| Telegram | channel `@apelmenych` |
| Instagram, TikTok | `bbllbbd` on both |
| Working hours | every day, 11:00–22:00 |
| Look of the home page | no space theme; "just have the logo assemble itself" (his feedback on the first live version) |

## Still needed

### Products

- [ ] **Stock for each product.** Every product starts at 10, which is not a real number. Set the
      real counts before the shop opens: buyers can order whatever the site says is in stock.
- [ ] Descriptions and compositions (he said he will write them himself; the product page hides
      the section while it is empty)
- [ ] Photos. Until then each product shows a drawn plate marked `PLACEHOLDER`.
      Landscape 4:3, at least 1000 px wide, one product per photo.
- [ ] Which products are «Новинка» (none are marked now, so the «Новинки» block is hidden)

### Delivery and payment

- [ ] **Courier fee for orders under 20 000 ֏.** The site says 1 000 ֏, which is our guess.
- [ ] How buyers pay (cash, transfer, on delivery?). The site does not say anything about it yet.
- [ ] Delivery area: all of Yerevan, or only some districts?
- [ ] Any cut-off rule, such as "orders after 15:00 are delivered the next day"? The field is empty now.

### Texts

- [ ] «О нас» text. It is still a `PLACEHOLDER`, and its first paragraph shows on the home page.
- [ ] Approve our wording of the home page title and subtitle:
      «Домашние пельмени ручной лепки» / «Пельмени, манты и хинкали. Лепим в Ереване.»
- [ ] Site description for search engines and link previews — `apps/web/index.html`
- [ ] Wording of the personal-data consent checkbox, if he wants it different —
      `apps/web/src/i18n/ru.ts` (`checkout.consent`)

### Contacts

- [ ] The Telegram link on the site opens the **channel** he sent. If buyers should write to him
      directly instead, put his personal username into «Настройки → Telegram».

### Brand

| What | Now | Where |
| --- | --- | --- |
| Original logo file (SVG, or PNG with a transparent background) | Round badge redrawn from the logo in the brand film | `apps/web/src/components/Logo.tsx` |
| Armenian line on the logo — confirm the spelling | «Ալյոշա Պելմենիչ», copied from `intro.html` | `apps/web/src/components/Logo.tsx` |
| Palette — approve the direction | The logo's light blue, cream and amber, with a deep navy header and footer | `apps/web/src/styles/tokens.css` |
| Favicon | Drawn dumpling | `apps/web/public/favicon.svg` |

### Telegram notifications

- [ ] Алексей creates a bot with @BotFather and sends the bot token
- [ ] He presses Start in that bot, so it is allowed to write to him; we then read his chat id
- Both go into the server's settings (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`); steps are in
  README, "Telegram bot". Until then order messages are only written to the server log.

### Admin password

- [ ] Алексей chooses the admin password; it is set during deployment (README, "Admin password").
      The development login is refused in production.

### Hosting

- [ ] Domain registered in Алексей's name (`pelmeni.am` or another `.am`), with its DNS A record
      pointed at the server
- [ ] VPS paid in Алексей's name: Ubuntu 24.04, 1 vCPU, 1 GB memory is enough
- [ ] Somewhere off the server to keep copies of the nightly backups

## Added beyond the original spec, because of his data

- A «Хинкали» category (the spec listed пельмени, вареники, манты, other). «Вареники» stays
  available as a category but has no products.
- A TikTok link next to Instagram.

## For the developer (not the client)

- [ ] Footer credit link «Сайт сделан: Rafayel» — `apps/web/src/config.ts`
