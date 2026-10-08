import {
  slugify,
  type AdminProduct,
  type AdminStockRequest,
  type Product,
  type ProductCreate,
  type ProductPatch,
  type SaveProductResult,
  type StockRequestGroup,
  type StockRequestStatus,
} from '@alyosha/shared';
import { and, asc, count, eq, max, ne, sql } from 'drizzle-orm';
import type { Db, Tx } from '../db/client';
import { orderItems, products, stockRequests } from '../db/schema';

type ProductRow = typeof products.$inferSelect;
type StockRequestRow = typeof stockRequests.$inferSelect;

export function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    category: row.category,
    priceAmd: row.priceAmd,
    weightLabel: row.weightLabel,
    stockQty: row.stockQty,
    isNew: row.isNew,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    imagePath: row.imagePath,
    videoPath: row.videoPath,
  };
}

function toStockRequest(row: StockRequestRow): AdminStockRequest {
  return {
    id: row.id,
    productId: row.productId,
    name: row.name,
    phone: row.phone,
    telegram: row.telegram,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

function openRequests(db: Db | Tx, productId: number): Promise<StockRequestRow[]> {
  return db
    .select()
    .from(stockRequests)
    .where(and(eq(stockRequests.productId, productId), eq(stockRequests.status, 'open')))
    .orderBy(asc(stockRequests.createdAt));
}

// ---------- Products ----------

export async function listAdminProducts(db: Db): Promise<AdminProduct[]> {
  const rows = await db.select().from(products).orderBy(asc(products.sortOrder), asc(products.id));
  const waiting = await db
    .select({ productId: stockRequests.productId, n: count() })
    .from(stockRequests)
    .where(eq(stockRequests.status, 'open'))
    .groupBy(stockRequests.productId);
  const waitingBy = new Map(waiting.map((row) => [row.productId, row.n]));
  return rows.map((row) => ({ ...toProduct(row), waitingCount: waitingBy.get(row.id) ?? 0 }));
}

export async function getAdminProduct(db: Db | Tx, id: number): Promise<AdminProduct | null> {
  const [row] = await db.select().from(products).where(eq(products.id, id));
  if (!row) return null;
  return { ...toProduct(row), waitingCount: (await openRequests(db, id)).length };
}

/** Appends -2, -3… until the slug is free. */
async function freeSlug(tx: Tx, wanted: string): Promise<string> {
  for (let n = 1; ; n += 1) {
    const slug = n === 1 ? wanted : `${wanted.slice(0, 74)}-${n}`;
    const [taken] = await tx.select({ id: products.id }).from(products).where(eq(products.slug, slug));
    if (!taken) return slug;
  }
}

export async function createProduct(db: Db, input: ProductCreate): Promise<AdminProduct> {
  return db.transaction(async (tx) => {
    const slug = await freeSlug(tx, input.slug || slugify(input.name) || 'tovar');
    // New products go to the end of the catalog.
    const [last] = await tx.select({ value: max(products.sortOrder) }).from(products);
    const [row] = await tx
      .insert(products)
      .values({
        name: input.name,
        slug,
        category: input.category,
        priceAmd: input.priceAmd,
        description: input.description ?? '',
        weightLabel: input.weightLabel ?? '',
        stockQty: input.stockQty ?? 0,
        isNew: input.isNew ?? false,
        isActive: input.isActive ?? true,
        sortOrder: (last?.value ?? 0) + 10,
      })
      .returning();
    return { ...toProduct(row!), waitingCount: 0 };
  });
}

export type UpdateProductResult =
  | ({ ok: true } & SaveProductResult)
  | { ok: false; error: 'not_found' | 'slug_taken' };

export async function updateProduct(db: Db, id: number, patch: ProductPatch): Promise<UpdateProductResult> {
  return db.transaction(async (tx) => {
    // Locked like an order would lock it, so a stock edit and a purchase never interleave.
    const [current] = await tx.select().from(products).where(eq(products.id, id)).for('update');
    if (!current) return { ok: false, error: 'not_found' };

    if (patch.slug && patch.slug !== current.slug) {
      const [taken] = await tx
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.slug, patch.slug), ne(products.id, id)));
      if (taken) return { ok: false, error: 'slug_taken' };
    }

    const [row] = await tx
      .update(products)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();

    const open = await openRequests(tx, id);
    // SPEC §7: when stock is raised from zero, show who is waiting for this product.
    const backInStock = current.stockQty === 0 && row!.stockQty > 0;
    return {
      ok: true,
      product: { ...toProduct(row!), waitingCount: open.length },
      waiting: backInStock ? open.map(toStockRequest) : [],
    };
  });
}

/** Stores the order the admin sees: first id gets 10, second 20, … */
export async function reorderProducts(db: Db, ids: number[]): Promise<void> {
  await db.transaction(async (tx) => {
    for (const [index, id] of ids.entries()) {
      await tx
        .update(products)
        .set({ sortOrder: (index + 1) * 10 })
        .where(eq(products.id, id));
    }
  });
}

export async function setProductImage(db: Db, id: number, imagePath: string | null): Promise<{ previous: string | null } | null> {
  return db.transaction(async (tx) => {
    const [current] = await tx.select({ imagePath: products.imagePath }).from(products).where(eq(products.id, id)).for('update');
    if (!current) return null;
    await tx.update(products).set({ imagePath, updatedAt: new Date() }).where(eq(products.id, id));
    return { previous: current.imagePath };
  });
}

/** Same as setProductImage, for the product's video. */
export async function setProductVideo(db: Db, id: number, videoPath: string | null): Promise<{ previous: string | null } | null> {
  return db.transaction(async (tx) => {
    const [current] = await tx.select({ videoPath: products.videoPath }).from(products).where(eq(products.id, id)).for('update');
    if (!current) return null;
    await tx.update(products).set({ videoPath, updatedAt: new Date() }).where(eq(products.id, id));
    return { previous: current.videoPath };
  });
}

export type DeleteProductResult =
  | { ok: true; imagePath: string | null; videoPath: string | null }
  | { ok: false; error: 'not_found' | 'has_orders' };

/** A product that appears in any order is part of the order history and can only be hidden. */
export async function deleteProduct(db: Db, id: number): Promise<DeleteProductResult> {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(products).where(eq(products.id, id)).for('update');
    if (!current) return { ok: false, error: 'not_found' };
    const [ordered] = await tx.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.productId, id)).limit(1);
    if (ordered) return { ok: false, error: 'has_orders' };
    await tx.delete(products).where(eq(products.id, id));
    return { ok: true, imagePath: current.imagePath, videoPath: current.videoPath };
  });
}

// ---------- "Notify me" requests ----------

export async function listStockRequestGroups(db: Db, includeHandled: boolean): Promise<StockRequestGroup[]> {
  const rows = await db
    .select({ request: stockRequests, productName: products.name, stockQty: products.stockQty })
    .from(stockRequests)
    .innerJoin(products, eq(products.id, stockRequests.productId))
    .where(includeHandled ? sql`true` : eq(stockRequests.status, 'open'))
    .orderBy(asc(products.sortOrder), asc(products.id), asc(stockRequests.createdAt));

  const groups = new Map<number, StockRequestGroup>();
  for (const row of rows) {
    let group = groups.get(row.request.productId);
    if (!group) {
      group = { product: { id: row.request.productId, name: row.productName, stockQty: row.stockQty }, requests: [] };
      groups.set(row.request.productId, group);
    }
    group.requests.push(toStockRequest(row.request));
  }
  return [...groups.values()];
}

export async function setStockRequestStatus(db: Db, id: number, status: StockRequestStatus): Promise<boolean> {
  const updated = await db.update(stockRequests).set({ status }).where(eq(stockRequests.id, id)).returning({ id: stockRequests.id });
  return updated.length > 0;
}

/** Marks every open request for the product as notified. Returns how many there were. */
export async function markProductRequestsNotified(db: Db, productId: number): Promise<number> {
  const updated = await db
    .update(stockRequests)
    .set({ status: 'notified' })
    .where(and(eq(stockRequests.productId, productId), eq(stockRequests.status, 'open')))
    .returning({ id: stockRequests.id });
  return updated.length;
}
