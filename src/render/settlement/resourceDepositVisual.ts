/** The amber seam keeps its footprint and gameplay identity as it is mined.
 * Only the presentation asset changes; the four stages are independent models. */
export function resourceDepositVisual(
  definition: string,
  amount: number | undefined,
  initialYield: number | undefined,
  normalAsset: string,
): string {
  if (definition !== 'building.neutral.amber-mine' || amount === undefined || !initialYield) return normalAsset;
  if (amount > initialYield * 2 / 3) return normalAsset;
  if (amount > initialYield / 3) return 'asset.resource.amber-seam-one-third';
  if (amount > 0) return 'asset.resource.amber-seam-two-thirds';
  return 'asset.resource.amber-seam-empty';
}
