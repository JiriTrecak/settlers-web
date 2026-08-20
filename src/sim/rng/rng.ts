/**
 * Deterministic PRNG (Mulberry32). Never use Math.random in sim.
 */
export type Rng = {
  nextFloat(): number;
  nextInt(max: number): number;
  /** Mulberry32 word. Checksums read this; do not use as a game value. */
  state(): number;
};

/** Continue a saved Mulberry32 word. `seedRng(s).state()` is not `s` — first draw already stepped. */
export function rngFromState(state: number): Rng {
  return seedRng(state >>> 0);
}

export function seedRng(seed: number): Rng {
  let a = seed >>> 0;
  const nextFloat = (): number => {
    // Mulberry32
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    nextFloat,
    nextInt(max: number): number {
      return Math.floor(nextFloat() * max);
    },
    state: () => a >>> 0,
  };
}
