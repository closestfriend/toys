/**
 * Seeded randomness. Use this instead of Math.random() so a bug can be
 * reproduced exactly: load the toy with ?seed=<n>.
 */
import { params } from './debug';

export function seedFromUrl(fallback?: number): number {
  const s = Number(params.get('seed'));
  if (Number.isFinite(s) && params.has('seed')) return s >>> 0;
  return fallback ?? (Math.random() * 2 ** 32) >>> 0;
}

export interface Rng {
  (): number;
  range(min: number, max: number): number;
  int(min: number, maxExclusive: number): number;
  pick<T>(arr: readonly T[]): T;
  chance(p: number): boolean;
}

/** mulberry32: tiny, fast, good enough for toys. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (() => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  next.range = (min, max) => min + next() * (max - min);
  next.int = (min, max) => Math.floor(next.range(min, max));
  next.pick = (arr) => arr[Math.floor(next() * arr.length)]!;
  next.chance = (p) => next() < p;
  return next;
}
