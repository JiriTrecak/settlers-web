export type Rng = {
  nextFloat(): number;
  nextInt(max: number): number;
};

/** Deterministic PRNG. Never use Math.random in sim. */
export function seedRng(seed: number): Rng {
  let a = seed >>> 0;
  const nextFloat = (): number => {
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
  };
}
