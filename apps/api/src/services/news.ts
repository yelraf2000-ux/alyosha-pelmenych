import type { AdminNewsPost, NewsPost, NewsPostInput } from '@alyosha/shared';
import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { newsPosts } from '../db/schema';

// «Новости». The site sees only published posts; the admin sees all of them.

type NewsRow = typeof newsPosts.$inferSelect;

function toNewsPost(row: NewsRow): NewsPost {
  return {
    id: row.id,
    title: row.title,
    text: row.text,
    imagePath: row.imagePath,
    videoPath: row.videoPath,
    publishedOn: row.publishedOn,
  };
}

function toAdminNewsPost(row: NewsRow): AdminNewsPost {
  return { ...toNewsPost(row), isPublished: row.isPublished };
}

const newestFirst = [desc(newsPosts.publishedOn), desc(newsPosts.id)];

export async function listNews(db: Db, limit?: number): Promise<NewsPost[]> {
  const query = db.select().from(newsPosts).where(eq(newsPosts.isPublished, true)).orderBy(...newestFirst);
  return (await (limit ? query.limit(limit) : query)).map(toNewsPost);
}

export async function getNewsPost(db: Db, id: number): Promise<NewsPost | null> {
  const [row] = await db
    .select()
    .from(newsPosts)
    .where(and(eq(newsPosts.id, id), eq(newsPosts.isPublished, true)));
  return row ? toNewsPost(row) : null;
}

export async function listAdminNews(db: Db): Promise<AdminNewsPost[]> {
  return (await db.select().from(newsPosts).orderBy(...newestFirst)).map(toAdminNewsPost);
}

export async function getAdminNewsPost(db: Db, id: number): Promise<AdminNewsPost | null> {
  const [row] = await db.select().from(newsPosts).where(eq(newsPosts.id, id));
  return row ? toAdminNewsPost(row) : null;
}

export async function createNewsPost(db: Db, input: NewsPostInput): Promise<AdminNewsPost> {
  const [row] = await db.insert(newsPosts).values(input).returning();
  return toAdminNewsPost(row!);
}

export async function updateNewsPost(db: Db, id: number, input: NewsPostInput): Promise<AdminNewsPost | null> {
  const [row] = await db
    .update(newsPosts)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(newsPosts.id, id))
    .returning();
  return row ? toAdminNewsPost(row) : null;
}

/** Returns the files the post had, for the caller to remove, or null if there was no such post. */
export async function deleteNewsPost(
  db: Db,
  id: number,
): Promise<{ imagePath: string | null; videoPath: string | null } | null> {
  const [row] = await db
    .delete(newsPosts)
    .where(eq(newsPosts.id, id))
    .returning({ imagePath: newsPosts.imagePath, videoPath: newsPosts.videoPath });
  return row ?? null;
}

/** Puts a new photo (or none) on the post and returns the one it replaced, or null if there is no such post. */
export async function setNewsImage(db: Db, id: number, imagePath: string | null): Promise<{ previous: string | null } | null> {
  return db.transaction(async (tx) => {
    const [current] = await tx.select({ imagePath: newsPosts.imagePath }).from(newsPosts).where(eq(newsPosts.id, id)).for('update');
    if (!current) return null;
    await tx.update(newsPosts).set({ imagePath, updatedAt: new Date() }).where(eq(newsPosts.id, id));
    return { previous: current.imagePath };
  });
}

/** Same as setNewsImage, for the post's video. */
export async function setNewsVideo(db: Db, id: number, videoPath: string | null): Promise<{ previous: string | null } | null> {
  return db.transaction(async (tx) => {
    const [current] = await tx.select({ videoPath: newsPosts.videoPath }).from(newsPosts).where(eq(newsPosts.id, id)).for('update');
    if (!current) return null;
    await tx.update(newsPosts).set({ videoPath, updatedAt: new Date() }).where(eq(newsPosts.id, id));
    return { previous: current.videoPath };
  });
}
