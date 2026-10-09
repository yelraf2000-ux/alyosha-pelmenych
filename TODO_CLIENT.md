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
| Look of the home page | no space theme; "just have the logo assemble itself" (his feedback on the first live version). His logo now appears big in the middle when the site opens, then shrinks into its place at the top. |

## Still needed

### Products

- [ ] **Stock for each product.** Every product starts at 10, which is not a real number. Set the
      real counts before the shop opens: buyers can order whatever the site says is in stock.
- [ ] Descriptions and compositions (he said he will write them himself; the product page hides
      the section while it is empty)
- [ ] Real photos. Until then the products show stand-in pictures:
      - four пельмени use the generated, photo-like pictures from the mockup Rafayel showed him.
        They are not photos of his food, so he should confirm he is happy for buyers to see them.
        The one on «куриные из бедра» shows beef, and the one on «с креветкой» shows no shrimp.
      - the other five use our own drawn illustrations (a plate with the right number of pieces
        and a hint of the filling), which cannot be mistaken for photos.
      Uploading a photo in the admin replaces a picture. Landscape 4:3, at least 1000 px wide,
      one product per photo. A product he adds himself shows the plain drawn plate until it
      gets a photo.
- [ ] Which products are «Новинка» (none are marked now, so the «Новинки» block is hidden)

- [ ] Videos, if he wants them: one short clip per product (up to a minute, straight from the
      phone), added on the product's page in the admin. The site shows it without sound.

### «Свой рецепт»

- [ ] **Price.** The site shows none and says «Цену назовём при подтверждении». If he has a price
      per kilogram (or per base, or extra for креветка and the like), say so and the site can show it.
- [ ] Confirm the rules as written on the page: not less than 2 kg (in steps of 0,5 kg, up to
      30 kg) and ready in 2–4 days.
- [ ] Does a custom order need a deposit before he starts? The page does not mention one.

### Delivery and payment

- [ ] **Courier fee for orders under 20 000 ֏.** He has no fixed price, so the site no longer
      charges one: it shows the goods total «+ доставка» and says the courier is paid separately.
      If he settles on a price, he types it into «Настройки → Стоимость доставки курьером» and the
      site goes back to adding it to the total (0 keeps «+ доставка»).
- [ ] How buyers pay (cash, transfer, on delivery?). The site does not say anything about it yet.
- [ ] Delivery area: all of Yerevan, or only some districts?
- [ ] Any cut-off rule, such as "orders after 15:00 are delivered the next day"? The field is empty now.

### Texts

- [ ] «О нас» text. It is his own story as he told it in the chat (пельмени with his parents as a
      child, years as a cook, started in Краснодар, continued in Yerevan), tidied up by us. He
      should read the wording and can change it in «Настройки»; its first paragraph also shows on
      the home page.
- [ ] «О нас» photo. The portrait he sent (with the bowl of filling) is shown beside the text on
      the home page and on the «О нас» page. It is a file in the site
      (`apps/web/public/about/`), not something he can change in the admin: a new photo goes
      through the developer.
- [ ] Approve the top of the home page: the name «Алёша Пельменыч», the title «Лепим от души,
      как для себя» (his own words) and the line «Доставка по Еревану» under it. The last one
      depends on the delivery area below: if he does not deliver to all of Yerevan, it must change.
- [ ] Site description for search engines and link previews — `apps/web/index.html`
- [ ] Personal data. The spec asked for a consent checkbox on the checkout page; it was removed
      at Rafayel's request, so the form now takes a name, phone and address with no word about
      what they are used for. He should decide whether that is fine for him, or whether a line
      such as «Оформляя заказ, вы соглашаетесь на обработку данных для его выполнения» should
      stand under the button (no checkbox needed).

### Contacts

- [ ] The Telegram link on the site opens the **channel** he sent. If buyers should write to him
      directly instead, put his personal username into «Настройки → Telegram».

### Brand

| What | Now | Where |
| --- | --- | --- |
| Logo | His own picture, sent on 9 Oct 2026 (a 1125×2000 JPG on light blue). The site shows it as it is: round with the blue, and at the top of the home page without the blue. A larger or vector original would be sharper on big screens; it replaces `scripts/logo/source.jpg`. | `apps/web/src/components/Logo.tsx`, `scripts/logo/build.mjs` |
| Palette — approve the direction | Warm dough and cream with an amber button colour; the top and bottom of each page fade from dough into a little of the logo's light blue. The logo itself keeps its blue disc. | `apps/web/src/styles/tokens.css` |
| Favicon | Drawn dumpling | `apps/web/public/favicon.svg` |

### Telegram bot

- [ ] Алексей creates a bot with @BotFather and gives the token to Rafayel, who puts it into the
      server's settings (`TELEGRAM_BOT_TOKEN`). The token is a secret: not into chats or screenshots.
- [ ] He opens the bot, presses Start and sends `/chatid`; the number goes into `TELEGRAM_CHAT_ID`.
      Until then orders are only written to the server log.
- [x] The bot's «Написать Алёше» button opens a chat with `@whosit` (changed in «Настройки → Ваш
      личный Telegram»).
- [ ] Read what the bot tells buyers (received / confirmed / done / cancelled) and say if any of it
      should be worded differently. Steps are in README, "Telegram bot".

### Admin password

- [ ] Алексей chooses the admin password; it is set during deployment (README, "Admin password").
      The development login is refused in production.

### Hosting

The shop runs on Render's paid plans (about $13.25, roughly 4 800 ֏, a month), on Rafayel's
Render account.

- [ ] Whose card pays for it in the long run. The card is the one on the account's Billing page
      and can be replaced there at any time.
- [x] Domain: `pelmeni.am`, bought on 9 Oct 2026 at name.am and connected to the shop. It is in
      Rafayel's name.am account, not Алексей's, and has to be renewed there every year.
- [ ] Whether the domain should be moved into Алексей's own name.am account.
- [ ] Copies of the product photos somewhere besides Render's disk. The database has Render's own
      backups; the photos do not, so he should keep the originals on his phone or computer.

## Added beyond the original spec, because of his data

- A «Хинкали» category (the spec listed пельмени, вареники, манты, other). «Вареники» and «Другое»
  exist but have no products, so buyers do not see them; he can delete them if he never needs them.
- A TikTok link next to Instagram.
- The shop can be run from Telegram: in the admin chat every order comes with buttons to confirm,
  complete or cancel it, and `/orders` lists the open ones.
- The Telegram bot also talks to buyers: a button on the thank-you page connects their chat to the
  order, and the bot then reports every change of status, with a button to write to the owner.
- «Свой рецепт»: a page where the buyer puts together пельмени of their own (base, additions,
  spices, a name for the package), says how much (from 2 kg) and leaves contacts. It is a request,
  not a cart order: Алексей gets it in Telegram and under «Рецепты» in the admin, and confirms it
  himself. He edits the three lists in «Настройки → Свой рецепт»; an empty list of bases switches
  the page off.
- Categories are the owner's own: he adds, renames and deletes them in the admin («Товары →
  Категории», or «+ Новая категория…» right in a product's form). The spec had a fixed list.
- Order statistics in the admin («Заказы → Статистика»): for one day or a run of days, how many
  orders were placed, how many were cancelled, the sums, and what was sold. The spec listed
  "analytics dashboards" as not for v1; this is a plain summary Rafayel asked for, with no charts,
  forecasts or planning.

## For the developer (not the client)

- [ ] Footer credit («Разработка сайта — Rafayel»): removed from the page for now at Rafayel's request; the name and an optional link are kept in `apps/web/src/config.ts` for when it comes back
