// «Новости»: posts the owner writes in the admin, shown on the site as a list and one page each.

import { z } from 'zod';
import { isIsoDate } from './admin';

export const NEWS_TITLE_MAX = 120;
export const NEWS_TEXT_MAX = 10000;
/** How much of the text the list shows under the title. */
export const NEWS_EXCERPT_LENGTH = 180;

export interface NewsPost {
  id: number;
  title: string;
  /** Paragraphs are separated by an empty line, as in the other texts of the site. */
  text: string;
  /** The 1000px photo, like a product's (see `smallImagePath`), or null. */
  imagePath: string | null;
  /** A clip, like a product's (see `videoInfo`), but with its sound, or null. */
  videoPath: string | null;
  /** The date shown on the post, YYYY-MM-DD. The list is newest first by it. */
  publishedOn: string;
}

export interface AdminNewsPost extends NewsPost {
  /** Hidden posts are seen only in the admin. */
  isPublished: boolean;
}

export const newsPostSchema = z.object({
  title: z.string().trim().min(1).max(NEWS_TITLE_MAX),
  text: z.string().trim().max(NEWS_TEXT_MAX),
  publishedOn: z.string().refine(isIsoDate),
  isPublished: z.boolean(),
});

export type NewsPostInput = z.output<typeof newsPostSchema>;

/** The beginning of the text for the list: the first paragraph, cut at a word if it is long. */
export function newsExcerpt(text: string, max = NEWS_EXCERPT_LENGTH): string {
  const first = text.trim().split(/\n\s*\n/)[0]?.replace(/\s+/g, ' ') ?? '';
  if (first.length <= max) return first;
  const cut = first.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return (space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,.;:—-]+$/, '') + '…';
}
