/** The amber seam keeps its footprint and gameplay identity as it is mined.
 * Only the presentation asset changes; the four stages are independent models. */
const amberDepletion = ['asset.resource.amber-seam-one-third', 'asset.resource.amber-seam-two-thirds', 'asset.resource.amber-seam-empty'] as const;
export function resourceDepositAssets(definition: string, normalAsset: string): readonly string[] {
  return definition === 'building.neutral.amber-mine'
    ? [normalAsset, ...amberDepletion]
    : [normalAsset];
}
export function resourceDepositVisual(
  definition: string,
  amount: number | undefined,
  initialYield: number | undefined,
  normalAsset: string,
): string {
  if (definition !== 'building.neutral.amber-mine' || amount === undefined || !initialYield) return normalAsset;
  if (amount > initialYield * 2 / 3) return normalAsset;
  return amberDepletion[amount > initialYield / 3 ? 0 : amount > 0 ? 1 : 2];
}
