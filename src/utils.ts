import type { Item, Side } from "./types";

export function formatValue(num: number): string {
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(num % 1_000_000 === 0 ? 0 : 1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(num % 1000 === 0 ? 0 : 1) + "k";
  }
  return String(num);
}

export function sumValue(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.value, 0);
}

export function betRange(total: number): { min: number; max: number } {
  return { min: Math.floor(total * 0.95), max: Math.ceil(total * 1.05) };
}

/** Image files live in /public, so they are served from the site root. */
export function img(file: string): string {
  return `/${file}`;
}

const preloaded = new Set<string>();
/** Downloads and decodes images in the background so they show instantly while scrolling. */
export function preloadImages(files: string[]) {
  for (const f of files) {
    if (!f || preloaded.has(f)) continue;
    preloaded.add(f);
    const el = new Image();
    el.decoding = "async";
    el.src = img(f);
    el.decode?.().catch(() => {});
  }
}

export function randomItem<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

export function otherSide(side: Side): Side {
  return side === "Heads" ? "Tails" : "Heads";
}

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a;
}

/**
 * Find items whose total is within +-5% of target, as close to the exact value as possible.
 * Returns null when no combination fits.
 */
export function findItemsInRange<T extends Item>(items: T[], target: number): T[] | null {
  const { min, max } = betRange(target);
  const list = items.filter((i) => i.value > 0 && i.value <= max).sort((a, b) => b.value - a.value);
  if (list.length === 0) return null;

  const unit = list.reduce((g, i) => gcd(g, i.value), 0) || 1;
  const cap = Math.floor(max / unit);

  // Very awkward values would make the exact search huge: fall back to a simple greedy pick.
  if (cap * list.length > 40_000_000) {
    const picked: T[] = [];
    let total = 0;
    for (const item of list) {
      if (total + item.value <= max) {
        picked.push(item);
        total += item.value;
      }
    }
    return total >= min ? picked : null;
  }

  const reach = new Uint8Array(cap + 1);
  const from = new Int32Array(cap + 1).fill(-1);
  reach[0] = 1;

  for (let i = 0; i < list.length; i++) {
    const v = list[i].value / unit;
    for (let s = cap; s >= v; s--) {
      if (!reach[s] && reach[s - v]) {
        reach[s] = 1;
        from[s] = i;
      }
    }
  }

  const lo = Math.ceil(min / unit);
  const t = Math.round(target / unit);
  let best = -1;
  for (let d = 0; d <= cap && best < 0; d++) {
    for (const s of [t - d, t + d]) {
      if (s >= lo && s <= cap && reach[s]) {
        best = s;
        break;
      }
    }
  }
  if (best < 0) return null;

  const out: T[] = [];
  for (let s = best; s > 0; ) {
    const item = list[from[s]];
    out.push(item);
    s -= item.value / unit;
  }
  return out;
}

/**
 * Pick the bot's items for a match: random items that add up to within +-5% of target.
 * The database re-checks the names and values, so this only has to suggest a bet.
 */
export function generateBotItems(target: number, catalog: Item[]): Item[] {
  const { min, max } = betRange(target);
  if (catalog.length === 0) return [];

  for (let attempt = 0; attempt < 300; attempt++) {
    const picked: Item[] = [];
    let total = 0;

    while (total < min) {
      const fits = catalog.filter((i) => total + i.value <= max);
      if (fits.length === 0) break;
      // prefer bigger items so large bets don't turn into dozens of tiny ones
      const big = fits.filter((i) => i.value >= (min - total) / 4);
      const item = randomItem(big.length ? big : fits);
      picked.push({ ...item });
      total += item.value;
    }

    if (total >= min && total <= max) return picked;
  }

  // Random picking failed: search exactly, allowing a few copies of every item.
  const pool: Item[] = [];
  for (const item of catalog) {
    const copies = Math.min(8, Math.floor(max / item.value));
    for (let i = 0; i < copies; i++) pool.push({ ...item });
  }
  return findItemsInRange(pool, target) ?? [];
}

/** Marketplace rate: every 1,000 item value = 18 coins. */
export const COINS_PER_1000 = 18;

/** Coins you get for selling items worth `value` (rounded down). */
export const sellCoins = (value: number) => Math.floor((value * COINS_PER_1000) / 1000);

/** Coins it costs to buy items worth `value` (rounded up). */
export const buyCoins = (value: number) => Math.ceil((value * COINS_PER_1000) / 1000);
