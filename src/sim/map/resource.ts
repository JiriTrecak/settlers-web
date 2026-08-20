/**
 * Underground deposits. Original maps pack type (high nibble) and amount 0–15
 * (low nibble); we store type + amount 0–`MAX_RESOURCE` per tile.
 */
export const RESOURCE_KINDS = ["coal", "iron", "gold", "gems", "brimstone", "fish"] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

/** Land probe signs. Fish is water-only and never a mountain sign. */
export const SIGN_KINDS = ["coal", "iron", "gold", "gems", "brimstone", "nothing"] as const;
export type SignKind = (typeof SIGN_KINDS)[number];

export type TileResource = { kind: ResourceKind; amount: number };

/** Cap after the original nibble is scaled up. */
export const MAX_RESOURCE = 50;

/** Original amount nibble 0–15 → our 0–127 scale, then clamped to `MAX_RESOURCE`. */
const ORIGINAL_AMOUNT_SCALE = 127 / 15;

const ORIGINAL_TYPE: readonly (ResourceKind | null)[] = [
  "fish",
  "coal",
  "iron",
  "gold",
  "gems",
  "brimstone",
];

/** Packed original cell: high nibble type, low nibble amount. Amount 0 is empty. */
export function fromOriginalResource(packed: number): TileResource | null {
  const amountNibble = packed & 0xf;
  if (amountNibble === 0) return null;
  const kind = ORIGINAL_TYPE[packed >> 4] ?? null;
  if (!kind) return null;
  const amount = Math.min(MAX_RESOURCE, Math.max(1, Math.round(amountNibble * ORIGINAL_AMOUNT_SCALE)));
  return { kind, amount };
}

export function isResourceKind(v: unknown): v is ResourceKind {
  return typeof v === "string" && (RESOURCE_KINDS as readonly string[]).includes(v);
}

export function isSignKind(v: unknown): v is SignKind {
  return typeof v === "string" && (SIGN_KINDS as readonly string[]).includes(v);
}

/** Wire / dump byte: 0 = none, then `RESOURCE_KINDS` in order. */
export function resourceTypeIndex(kind: ResourceKind | null): number {
  if (!kind) return 0;
  return RESOURCE_KINDS.indexOf(kind) + 1;
}

export function resourceKindAt(index: number): ResourceKind | null {
  if (index < 1 || index > RESOURCE_KINDS.length) return null;
  return RESOURCE_KINDS[index - 1]!;
}

/** Sign graphic + fill 0–1 from the tile deposit. Fish / empty → nothing. */
export function signFromResource(res: TileResource | null): { sign: SignKind; fill: number } {
  if (!res || res.kind === "fish") return { sign: "nothing", fill: 0 };
  return { sign: res.kind, fill: Math.min(1, res.amount / MAX_RESOURCE) };
}
