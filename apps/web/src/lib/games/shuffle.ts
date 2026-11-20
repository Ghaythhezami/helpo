/** Small deterministic PRNG (mulberry32) so a game looks the same on every render and in tests. */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates with a seeded PRNG. Never returns the identity order when there are 2+ items. */
export function shuffleSeeded<T>(items: readonly T[], seed: string): T[] {
  const out = [...items];
  if (out.length < 2) return out;
  const rand = seededRandom(seed);
  for (let attempt = 0; attempt < 6; attempt++) {
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    if (out.some((item, index) => item !== items[index])) return out;
  }
  // Fall back to a rotation, which is never the identity.
  return [...items.slice(1), items[0]];
}
