import {
  slugify,
  type AdminProduct,
  type Product,
  type ProductCreate,
  type ProductPatch,
  type SaveProductResult,
} from '@alyosha/shared';
import { and, asc, eq, max, ne } from 'drizzle-orm';
import type { Db, Tx } from '../db/client';
import { orderItems, products } from '../db/schema';

type ProductRow = typeof products.$inferSelect;

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
    badges: row.badges,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    imagePath: row.imagePath,
    videoPath: row.videoPath,
  };
}

// ---------- Products ----------

export async function listAdminProducts(db: Db): Promise<AdminProduct[]> {
  const rows = await db.select().from(products).orderBy(asc(products.sortOrder), asc(products.id));
  return rows.map(toProduct);
}

export async function getAdminProduct(db: Db | Tx, id: number): Promise<AdminProduct | null> {
  const [row] = await db.select().from(products).where(eq(products.id, id));
  return row ? toProduct(row) : null;
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
        badges: input.badges ?? [],
        isActive: input.isActive ?? true,
        sortOrder: (last?.value ?? 0) + 10,
      })
      .returning();
    return toProduct(row!);
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
    return { ok: true, product: toProduct(row!) };
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
