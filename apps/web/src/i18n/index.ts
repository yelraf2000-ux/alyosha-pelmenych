import { ru } from './ru';

// Armenian comes after v1: add hy.ts with the same shape and choose the dictionary here.
export type Dictionary = typeof ru;
export const t: Dictionary = ru;
