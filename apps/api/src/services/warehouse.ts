import {
  shopToday,
  type AdminIngredient,
  type CompositionLine,
  type IngredientCreate,
  type IngredientPatch,
  type IngredientPurchase,
  type PurchaseInput,
  type WarehouseView,
} from '@alyosha/shared';
import { asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db, Tx } from '../db/client';
import { ingredientPurchases, ingredients, productIngredients, products, type IngredientUse } from '../db/schema';

// «Склад»: what the goods are made from, what it cost, and how much is left.
//
// Every ingredient keeps the average price of what is on its shelf. A purchase mixes its own price
// into that average by quantity; using some up leaves the price as it is. When an order is placed,
// each of its lines remembers what one of the product cost at those prices (its cost, for the
// profit) and what it was made of (taken off the shelf now, and put back exactly so if the order
// is cancelled). A product without a composition costs nothing known and takes nothing.

type IngredientRow = typeof ingredients.$inferSelect;

/** How many of the latest purchases the page lists. */
const PURCHASES_SHOWN = 100;

function toIngredient(row: IngredientRow): AdminIngredient {
  return { id: row.id, name: row.name, unit: row.unit, stockQty: row.stockQty, unitCostAmd: row.unitCostAmd };
}

/** Quantities are kept to a thousandth of a gram: enough, and free of 4599.999999. */
const tidy = (value: number) => Math.round(value * 1000) / 1000;

export async function getWarehouse(db: Db | Tx): Promise<WarehouseView> {
  const rows = await db.select().from(ingredients).orderBy(asc(ingredients.name));
  const purchases = await db
    .select()
    .from(ingredientPurchases)
    .orderBy(desc(ingredientPurchases.purchasedOn), desc(ingredientPurchases.id))
    .limit(PURCHASES_SHOWN);
  const lines = await db
    .select({
      productId: products.id,
      name: products.name,
      priceAmd: products.priceAmd,
      ingredientId: productIngredients.ingredientId,
      qty: productIngredients.qty,
    })
    .from(productIngredients)
    .innerJoin(products, eq(products.id, productIngredients.productId))
    .orderBy(asc(products.sortOrder), asc(products.id), asc(productIngredients.ingredientId));

  const byProduct = new Map<number, WarehouseView['products'][number]>();
  for (const line of lines) {
    let product = byProduct.get(line.productId);
    if (!product) {
      product = { id: line.productId, name: line.name, priceAmd: line.priceAmd, composition: [] };
      byProduct.set(line.productId, product);
    }
    product.composition.push({ ingredientId: line.ingredientId, qty: line.qty });
  }

  return {
    ingredients: rows.map(toIngredient),
    purchases: purchases.map(
      (row): IngredientPurchase => ({
        id: row.id,
        ingredientId: row.ingredientId,
        qty: row.qty,
        paidAmd: row.paidAmd,
        purchasedOn: row.purchasedOn,
      }),
    ),
    products: [...byProduct.values()],
  };
}

export type WarehouseResult =
  | { ok: true; warehouse: WarehouseView }
  /** `in_use`: the ingredient is in a product's composition. */
  | { ok: false; error: 'not_found' | 'name_taken' | 'in_use' };

/** Is the name taken by another ingredient? Case does not matter: «Мука» and «мука» are one thing. */
async function nameTaken(tx: Tx, name: string, exceptId: number | null): Promise<boolean> {
  // Compared here, not with SQL lower(): under the C locale Postgres leaves Cyrillic as it is.
  const key = name.toLocaleLowerCase('ru');
  const rows = await tx.select({ id: ingredients.id, name: ingredients.name }).from(ingredients);
  return rows.some((row) => row.id !== exceptId && row.name.toLocaleLowerCase('ru') === key);
}

export async function createIngredient(db: Db, input: IngredientCreate): Promise<WarehouseResult> {
  return db.transaction(async (tx) => {
    if (await nameTaken(tx, input.name, null)) return { ok: false, error: 'name_taken' };
    await tx.insert(ingredients).values({
      name: input.name,
      unit: input.unit,
      stockQty: tidy(input.stockQty ?? 0),
      unitCostAmd: input.unitCostAmd ?? 0,
    });
    return { ok: true, warehouse: await getWarehouse(tx) };
  });
}

/** Renames an ingredient, or sets what a count of the shelf found and its price. */
export async function updateIngredient(db: Db, id: number, patch: IngredientPatch): Promise<WarehouseResult> {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(ingredients).where(eq(ingredients.id, id)).for('update');
    if (!current) return { ok: false, error: 'not_found' };
    if (patch.name !== undefined && (await nameTaken(tx, patch.name, id))) return { ok: false, error: 'name_taken' };
    await tx
      .update(ingredients)
      .set({
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.stockQty !== undefined && { stockQty: tidy(patch.stockQty) }),
        ...(patch.unitCostAmd !== undefined && { unitCostAmd: patch.unitCostAmd }),
        updatedAt: new Date(),
      })
      .where(eq(ingredients.id, id));
    return { ok: true, warehouse: await getWarehouse(tx) };
  });
}

/** An ingredient that is in a composition stays: the product would silently lose part of its cost. */
export async function deleteIngredient(db: Db, id: number): Promise<WarehouseResult> {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(ingredients).where(eq(ingredients.id, id)).for('update');
    if (!current) return { ok: false, error: 'not_found' };
    const [used] = await tx
      .select({ productId: productIngredients.productId })
      .from(productIngredients)
      .where(eq(productIngredients.ingredientId, id))
      .limit(1);
    if (used) return { ok: false, error: 'in_use' };
    // Its purchases go with it (ON DELETE CASCADE).
    await tx.delete(ingredients).where(eq(ingredients.id, id));
    return { ok: true, warehouse: await getWarehouse(tx) };
  });
}

/**
 * Writes down a purchase: the stock grows, and the average price takes in what was paid. When the
 * shelf was empty (or below zero: more was used than bought), the new price is the purchase's own.
 */
export async function addPurchase(db: Db, ingredientId: number, input: PurchaseInput): Promise<WarehouseResult> {
  return db.transaction(async (tx) => {
    // Locked: two purchases of the same thing at once must both count in the average.
    const [current] = await tx.select().from(ingredients).where(eq(ingredients.id, ingredientId)).for('update');
    if (!current) return { ok: false, error: 'not_found' };

    const unitCostAmd =
      current.stockQty > 0
        ? (current.stockQty * current.unitCostAmd + input.paidAmd) / (current.stockQty + input.qty)
        : input.paidAmd / input.qty;
    await tx
      .update(ingredients)
      .set({ stockQty: tidy(current.stockQty + input.qty), unitCostAmd, updatedAt: new Date() })
      .where(eq(ingredients.id, ingredientId));
    await tx.insert(ingredientPurchases).values({
      ingredientId,
      qty: input.qty,
      paidAmd: input.paidAmd,
      purchasedOn: input.purchasedOn ?? shopToday(),
    });
    return { ok: true, warehouse: await getWarehouse(tx) };
  });
}

/**
 * Takes back a purchase written down by mistake: its quantity leaves the stock, and its money
 * leaves the average price as well as can be told now. If that empties the shelf, the price stays.
 */
export async function deletePurchase(db: Db, purchaseId: number): Promise<WarehouseResult> {
  return db.transaction(async (tx) => {
    const [purchase] = await tx.select().from(ingredientPurchases).where(eq(ingredientPurchases.id, purchaseId));
    if (!purchase) return { ok: false, error: 'not_found' };
    const [current] = await tx.select().from(ingredients).where(eq(ingredients.id, purchase.ingredientId)).for('update');
    if (!current) return { ok: false, error: 'not_found' };

    const stockQty = tidy(current.stockQty - purchase.qty);
    let unitCostAmd = current.unitCostAmd;
    if (current.stockQty > 0 && stockQty > 0) {
      const without = (current.stockQty * current.unitCostAmd - purchase.paidAmd) / stockQty;
      if (without >= 0) unitCostAmd = without;
    }
    await tx.update(ingredients).set({ stockQty, unitCostAmd, updatedAt: new Date() }).where(eq(ingredients.id, current.id));
    await tx.delete(ingredientPurchases).where(eq(ingredientPurchases.id, purchaseId));
    return { ok: true, warehouse: await getWarehouse(tx) };
  });
}

// ---------- A product's composition ----------

/** What one of the product is made of; null when there is no such product. */
export async function getComposition(db: Db | Tx, productId: number): Promise<CompositionLine[] | null> {
  const [product] = await db.select({ id: products.id }).from(products).where(eq(products.id, productId));
  if (!product) return null;
  return db
    .select({ ingredientId: productIngredients.ingredientId, qty: productIngredients.qty })
    .from(productIngredients)
    .where(eq(productIngredients.productId, productId))
    .orderBy(asc(productIngredients.ingredientId));
}

export type SetCompositionResult =
  | { ok: true; lines: CompositionLine[] }
  /** `invalid`: one of the ingredients does not exist. */
  | { ok: false; error: 'not_found' | 'invalid' };

/** Replaces the composition. Orders already placed keep the cost and composition they had. */
export async function setComposition(db: Db, productId: number, lines: CompositionLine[]): Promise<SetCompositionResult> {
  return db.transaction(async (tx) => {
    const [product] = await tx.select({ id: products.id }).from(products).where(eq(products.id, productId)).for('update');
    if (!product) return { ok: false, error: 'not_found' };
    const ids = lines.map((line) => line.ingredientId);
    if (ids.length > 0) {
      const found = await tx.select({ id: ingredients.id }).from(ingredients).where(inArray(ingredients.id, ids));
      if (found.length !== new Set(ids).size) return { ok: false, error: 'invalid' };
    }
    await tx.delete(productIngredients).where(eq(productIngredients.productId, productId));
    if (lines.length > 0) {
      await tx.insert(productIngredients).values(lines.map((line) => ({ productId, ingredientId: line.ingredientId, qty: line.qty })));
    }
    return { ok: true, lines: (await getComposition(tx, productId))! };
  });
}

// ---------- Orders ----------

/** What an order line records about the making of one: its cost then, and what it was made of. */
export interface LineMaking {
  unitCostAmd: number | null;
  ingredients: IngredientUse[] | null;
}

/** Today's cost and composition of each product; a product without a composition gets nulls. */
export async function makingOf(tx: Tx, productIds: number[]): Promise<Map<number, LineMaking>> {
  const result = new Map<number, LineMaking>(productIds.map((id) => [id, { unitCostAmd: null, ingredients: null }]));
  if (productIds.length === 0) return result;
  const rows = await tx
    .select({
      productId: productIngredients.productId,
      ingredientId: productIngredients.ingredientId,
      qty: productIngredients.qty,
      unitCostAmd: ingredients.unitCostAmd,
    })
    .from(productIngredients)
    .innerJoin(ingredients, eq(ingredients.id, productIngredients.ingredientId))
    .where(inArray(productIngredients.productId, productIds))
    .orderBy(asc(productIngredients.ingredientId));

  const sums = new Map<number, number>();
  for (const row of rows) {
    const making = result.get(row.productId)!;
    making.ingredients = [...(making.ingredients ?? []), { id: row.ingredientId, qty: row.qty }];
    sums.set(row.productId, (sums.get(row.productId) ?? 0) + row.qty * row.unitCostAmd);
  }
  for (const [productId, sum] of sums) result.get(productId)!.unitCostAmd = Math.round(sum);
  return result;
}

/**
 * Moves ingredients on and off the shelf for order lines: `times` of each composition, negative to
 * take them, positive to put them back. Ingredients deleted since are skipped. Rows are changed in
 * id order, so two orders at once cannot deadlock here.
 */
export async function moveIngredients(tx: Tx, moves: { uses: IngredientUse[] | null; times: number }[]): Promise<void> {
  const delta = new Map<number, number>();
  for (const { uses, times } of moves) {
    for (const use of uses ?? []) delta.set(use.id, (delta.get(use.id) ?? 0) + use.qty * times);
  }
  for (const id of [...delta.keys()].sort((a, b) => a - b)) {
    const change = tidy(delta.get(id)!);
    if (change === 0) continue;
    await tx
      .update(ingredients)
      .set({ stockQty: sql`round((${ingredients.stockQty} + ${change})::numeric, 3)::double precision`, updatedAt: new Date() })
      .where(eq(ingredients.id, id));
  }
}
