import { slugify, type AdminCategory, type Category } from '@alyosha/shared';
import { asc, count, eq, max } from 'drizzle-orm';
import type { Db, Tx } from '../db/client';
import { categories, products } from '../db/schema';

/** Every category in the order the owner sees them. */
export async function listCategories(db: Db | Tx): Promise<Category[]> {
  return db
    .select({ slug: categories.slug, name: categories.name })
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.slug));
}

/** The same, with how many products each one holds (hidden products count too). */
export async function listAdminCategories(db: Db | Tx): Promise<AdminCategory[]> {
  const used = await db.select({ slug: products.category, n: count() }).from(products).groupBy(products.category);
  const usedBy = new Map(used.map((row) => [row.slug, row.n]));
  return (await listCategories(db)).map((category) => ({ ...category, productCount: usedBy.get(category.slug) ?? 0 }));
}

export async function categoryExists(db: Db | Tx, slug: string): Promise<boolean> {
  const [row] = await db.select({ slug: categories.slug }).from(categories).where(eq(categories.slug, slug));
  return Boolean(row);
}

/** A new category at the end of the list. Its slug is made from the name; -2, -3… if that is taken. */
export async function createCategory(db: Db, name: string): Promise<AdminCategory> {
  return db.transaction(async (tx) => {
    const wanted = slugify(name).slice(0, 60) || 'category';
    let slug = wanted;
    for (let n = 2; await categoryExists(tx, slug); n += 1) slug = `${wanted}-${n}`;
    const [last] = await tx.select({ value: max(categories.sortOrder) }).from(categories);
    await tx.insert(categories).values({ slug, name, sortOrder: (last?.value ?? 0) + 10 });
    return { slug, name, productCount: 0 };
  });
}

/** Changes what people read. The slug stays, so the products of the category are not touched. */
export async function renameCategory(db: Db, slug: string, name: string): Promise<AdminCategory | null> {
  const [row] = await db.update(categories).set({ name }).where(eq(categories.slug, slug)).returning();
  if (!row) return null;
  return (await listAdminCategories(db)).find((category) => category.slug === slug) ?? null;
}

export type DeleteCategoryResult = { ok: true } | { ok: false; error: 'not_found' | 'has_products' };

/** Only an empty category can go: its products would be left without a place in the catalog. */
export async function deleteCategory(db: Db, slug: string): Promise<DeleteCategoryResult> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(categories).where(eq(categories.slug, slug)).for('update');
    if (!row) return { ok: false, error: 'not_found' };
    const [used] = await tx.select({ n: count() }).from(products).where(eq(products.category, slug));
    if ((used?.n ?? 0) > 0) return { ok: false, error: 'has_products' };
    await tx.delete(categories).where(eq(categories.slug, slug));
    return { ok: true };
  });
}
