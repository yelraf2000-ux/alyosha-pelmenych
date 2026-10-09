// Empties the shop of everything buyers have sent it: orders, «Свой рецепт» requests and
// «Сообщить о поступлении» requests, with the names, phones and addresses in them. For the day
// the shop opens, to remove what was entered while trying it out. The next order is A-0001 again.
//
// Products, categories, photos, texts and settings, and the admin password are not touched.
// Stock is not put back: check the numbers under «Товары» afterwards.
//
//   node apps/api/dist/clear-orders.js          shows how much there is, deletes nothing
//   node apps/api/dist/clear-orders.js --yes    deletes it; this cannot be undone
//
// (in development: `npm run orders:clear -w @alyosha/api`, with `-- --yes` to delete)

import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { createDb } from '../db/client';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set. See apps/api/.env.example.');

const confirmed = process.argv.includes('--yes');
const { db, pool } = createDb(url);

try {
  const counted = await db.execute<{ orders: number; items: number; recipes: number; requests: number }>(sql`
    SELECT
      (SELECT count(*)::int FROM orders) AS orders,
      (SELECT count(*)::int FROM order_items) AS items,
      (SELECT count(*)::int FROM custom_orders) AS recipes,
      (SELECT count(*)::int FROM stock_requests) AS requests
  `);
  const { orders, items, recipes, requests } = counted.rows[0]!;

  console.log(`Orders: ${orders} (with ${items} lines of goods)`);
  console.log(`«Свой рецепт» requests: ${recipes}`);
  console.log(`«Сообщить о поступлении» requests: ${requests}`);

  if (!confirmed) {
    console.log();
    console.log('Nothing was deleted. To delete all of the above for good, run the same command with --yes');
  } else {
    await db.transaction(async (tx) => {
      await tx.execute(sql`TRUNCATE order_items, orders, custom_orders, stock_requests RESTART IDENTITY`);
      await tx.execute(sql`ALTER SEQUENCE order_number_seq RESTART WITH 1`);
      await tx.execute(sql`ALTER SEQUENCE custom_order_number_seq RESTART WITH 1`);
    });
    console.log();
    console.log('Deleted. The next order will be A-0001 and the next recipe R-0001.');
  }
} finally {
  await pool.end();
}
