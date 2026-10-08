# SPEC — «Алёша Пельменыч» online shop, v1

Read this whole file before writing code. If something here is unclear or contradictory, ask before building.

## 1. Context

- **Client:** Алексей, small producer of handmade frozen food in Yerevan. Brand: **«Алёша Пельменыч»** (logo has an Armenian line under it; logo file will be provided as `assets/logo.jpg`).
- **Products:** пельмени, вареники, манты; more will be added later.
- **Domain (wanted):** `pelmeni.am` or another short `.am` name — client decides. Domain and hosting are registered and paid **in the client's name**.
- **Developer:** Rafayel (solo). First client project, done for a symbolic fee in exchange for a case study, so **scope discipline matters**: build exactly v1, nothing extra.
- **Functional reference the client liked:** shagalov-family.ru (catalog of dumplings, out-of-stock items can't be added to cart and show «ожидается поставка», pickup vs courier at checkout, simple buyer form). Use it as a **behaviour reference only**. Do not copy its design, texts, images or code.

## 2. What the client asked for (his words, summarised)

- A catalog with **current stock, prices, descriptions**.
- Buyers build a **cart** and leave an **order request**; the client **contacts the buyer himself** (no online payment).
- **Cannot order more than is in stock.** When an order is placed, stock decreases.
- Out of stock: show «ожидается поставка», cannot add to cart, but the buyer can leave a **"notify me when available"** request.
- Checkout: **name, phone, Telegram username, comment**. No e-mail required. No customer accounts.
- Delivery: **pickup** (show pickup address) **or courier delivery**. Texts like the free-delivery threshold must be editable by the client in the admin.
- After ordering: a clear confirmation «Заказ принят! Мы свяжемся с вами в ближайшее время».
- Homepage: all products, a separate **«Новинки»** block, **«О нас»**, **«Доставка и оплата»**, **«Контакты»**.
- Admin panel: add/edit products, set stock, see and manage orders, edit site texts.

## 3. Scope

### In v1
- Public storefront (sections 5–6)
- Admin panel (section 7)
- Telegram notification to the owner for every new order and every "notify me" request
- Russian UI, i18n-ready structure for Armenian later
- Mobile-first responsive design, deploy on a small VPS

### Explicitly NOT in v1 (do not build, do not scaffold)
- Online payment
- Customer accounts / login for buyers
- Analytics dashboards, ingredient/material planning, production forecasting
- Promo codes, loyalty, reviews, blog
- Multi-admin roles
- Armenian translation content (structure only)

If you think something from this list is required, stop and ask.

## 4. Tech stack

Developer's stack — keep to it:
- **Frontend:** React + Vite + TypeScript, React Router. Plain CSS or CSS modules with design tokens (no heavy UI kit needed).
- **Backend:** Fastify + TypeScript.
- **DB:** PostgreSQL with Drizzle ORM (migrations checked into the repo).
- **Images:** uploaded via admin, stored on disk (`/uploads`), resized to web sizes with `sharp` (e.g. 400px and 1000px WebP), served by Fastify/nginx with cache headers.
- **Notifications:** Telegram Bot API (owner's chat id in env).
- **Deploy:** single VPS, Docker Compose (app + Postgres + nginx/Caddy with HTTPS). Budget target: cheapest VPS that runs it comfortably.
- Monorepo layout suggestion: `apps/web`, `apps/api`, `packages/shared` (types + zod schemas).

## 5. Data model

```
Product
  id, slug, name, description (text), category (pelmeni | vareniki | manty | other),
  price_amd (int), weight_label (e.g. "500 г"), stock_qty (int, >= 0),
  is_new (bool), is_active (bool), sort_order (int),
  image_path (nullable), created_at, updated_at

Order
  id, public_number (short, human-friendly, e.g. "A-0042"),
  customer_name, customer_phone, customer_telegram (nullable), comment (nullable),
  delivery_method (pickup | courier), delivery_address (required if courier),
  items_total_amd, delivery_fee_amd, total_amd,
  status (new | confirmed | done | cancelled),
  created_at, updated_at

OrderItem
  id, order_id, product_id, product_name_snapshot, price_amd_snapshot, qty

StockRequest   ("notify me when available")
  id, product_id, name, phone, telegram (nullable), status (open | notified | closed), created_at

Setting  (key/value, editable in admin)
  about_text, delivery_text, contacts_text, pickup_address,
  courier_fee_amd, free_delivery_from_amd, delivery_note (e.g. "Заказы после 15:00 — на следующий день"),
  hero_title, hero_subtitle, phone_public, telegram_public, instagram_url
```

Rules:
- Currency: **AMD**, integers only, display as `1 640 ֏`.
- Prices and names are **snapshotted** into OrderItem.
- `stock_qty` can never go below 0.

## 6. Storefront

### Pages
1. **Главная** — hero (brand, short tagline from settings), «Новинки» row, full catalog grouped or filterable by category, short «О нас» teaser, delivery summary, contacts.
2. **Товар** (`/product/:slug`) — photo, name, weight, price, description, stock state, qty selector, add to cart.
3. **Корзина** — items, qty +/- (capped by stock), remove, subtotal, delivery choice preview.
4. **Оформление** — form (below), summary, submit.
5. **Заказ принят** — order number, short summary, «Мы свяжемся с вами в ближайшее время», links back.
6. **О нас**, **Доставка и оплата**, **Контакты** — content from settings.

### Product card states
- In stock: price, qty stepper (max = stock), «В корзину».
- Low stock (≤ 3): small «Осталось N шт.» note.
- Out of stock: greyed button «Ожидается поставка» + link «Сообщить о поступлении» → small modal (name, phone, Telegram) → creates StockRequest.
- `is_new`: badge «Новинка».

### Checkout form
- Имя* , Телефон* (Armenian format hint, accept +374…), Telegram (optional, `@username`), Комментарий (optional)
- Способ получения*: **Самовывоз** (shows `pickup_address`) / **Доставка курьером** (shows address field*, fee from settings; free if subtotal ≥ `free_delivery_from_amd`; show `delivery_note`)
- Consent checkbox* to processing personal data for the order
- Honeypot field + basic rate limit against spam
- Cart is stored in `localStorage` (wrap in try/catch); the server is the source of truth on submit.

### Order submission (server)
- Validate with zod.
- In **one DB transaction**: lock product rows (`SELECT … FOR UPDATE`), check each qty ≤ stock, decrement stock, create Order + OrderItems.
- If any item is short: reject with a clear per-item message («Осталось только 2 шт.») and let the buyer adjust; never oversell.
- After commit: send Telegram message to the owner (order number, items, total, delivery, customer contacts with a tap-to-open `t.me/<username>` link and phone).

## 7. Admin panel (`/admin`)

- **Auth:** single admin. Password hash (argon2/bcrypt) from env, httpOnly secure session cookie, login rate limit. No sign-up.
- **Products:** list with inline stock edit; create/edit form (all fields + image upload); toggle active / new; drag or number sort.
- **Orders:** list newest first with status filter; detail view; change status. **Cancelling an order returns its items to stock** (in a transaction). Show customer contacts with one-tap links.
- **«Сообщить о поступлении» requests:** grouped by product; when stock is raised from 0, show a hint «N человек ждут этот товар» with their contacts; mark as notified.
- **Settings:** edit all `Setting` keys (texts, fees, threshold, addresses, contacts).
- **Today view (simple):** count of new orders and total quantities per product for orders with status `new`/`confirmed` — a plain table, no charts. (Helps the owner know how much to prepare. Keep it this simple.)
- Admin UI can be plain and functional; mobile-usable (the owner will use his phone).

## 8. Design

- **Mood:** warm, homemade, appetising, clean. Not corporate.
- **Palette** from the logo: soft light blue background tone, warm dough/cream and golden-brown accents, dark brown text. Define tokens in `:root`; provide a calm dark mode only if cheap, otherwise light only.
- **Typography:** a friendly rounded or soft serif for headings, clean sans (Inter or similar) for UI. Must support Cyrillic and Armenian glyphs.
- **Motion:** the client liked a "next-level" animated hero (a product rotating/floating). Do a **light** version: one subtle hero animation (e.g. dumplings gently floating, slight parallax) with CSS/Framer Motion, **disabled under `prefers-reduced-motion`**, and nothing that slows the catalog. Performance beats effects.
- **Photos:** real product photos from the client. Until then use neutral placeholders clearly marked `PLACEHOLDER`. Never use stock photos presented as his products.
- Mobile-first: most buyers come from Instagram/Telegram on phones. Sticky cart button on mobile.

## 9. Content rules

- All UI text in Russian, short and warm. Use `вы`.
- No invented reviews, ratings, "1000+ клиентов" claims, or fake badges.
- Seed data: 3 sample products (пельмени, вареники, манты) with `PLACEHOLDER` descriptions and prices marked `TODO_CLIENT`, so the owner replaces them.
- Footer: brand, contacts from settings, «Сайт сделан: Rafayel» with link (configurable).

## 10. Security & ops

- Secrets only in env: `DATABASE_URL`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `PUBLIC_BASE_URL`.
- Never expose admin endpoints without auth; validate all input; limit upload size and types (jpg/png/webp).
- CORS locked to the site origin. Helmet-style headers.
- Daily Postgres backup (pg_dump to a mounted volume) via a simple cron in compose.
- `README.md`: local dev, env vars, deploy steps, how to create the Telegram bot and get the chat id, how to change the admin password.

## 11. Build phases

**Phase 0 — clickable prototype (show the client first, ~1 day)**
- Frontend only with mock data: homepage, product page, cart, checkout, success page, styled with the brand.
- Deploy a preview (e.g. a free static host) so the client can open it on his phone.
- Stop and wait for client feedback before Phase 1.

**Phase 1 — backend and real orders**
- DB schema + migrations, products API, order submission with stock transaction, Telegram notification, stock requests.

**Phase 2 — admin panel**
- Auth, products, orders with status and stock return on cancel, stock requests, settings, today view.

**Phase 3 — deploy**
- VPS, Docker Compose, HTTPS, domain, backups, README.

## 12. Definition of done (v1)

- A buyer on a phone can browse, add items, check out with pickup or courier, and sees the confirmation.
- Ordering more than stock is impossible, even with two buyers ordering the last item at the same time (test it).
- Stock decreases on order and returns on cancel.
- Out-of-stock items show «Ожидается поставка» and accept "notify me" requests.
- The owner receives a Telegram message for each order and request.
- The owner can, from his phone: add a product with a photo, change stock and prices, change order status, edit texts and the free-delivery threshold.
- Lighthouse mobile performance ≥ 85 on the homepage.
- All placeholders are listed in `TODO_CLIENT.md` (photos, texts, prices, pickup address, contacts, delivery fees).
