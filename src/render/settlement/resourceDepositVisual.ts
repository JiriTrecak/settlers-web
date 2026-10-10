import type {Definition} from '../../content/schema';

type DepositDefinition = Pick<Definition, 'asset' | 'yield' | 'resourceVisuals'>;

/** Preload every declared variant and shared depletion stage before gameplay. */
export function resourceDepositAssets(definition: DepositDefinition): readonly string[] {
  const visuals = definition.resourceVisuals;
  return visuals ? [...new Set([...visuals.variants, ...visuals.stages.map(s => s.asset)])] : [definition.asset];
}

/** Appearance selects the full shape; depletion always takes precedence. */
export function resourceDepositVisual(
  definition: DepositDefinition,
  amount: number | undefined,
  initialAmount: number | undefined,
  appearanceAsset?: string,
): string {
  const full = appearanceAsset ?? definition.asset;
  const initial = initialAmount ?? definition.yield;
  if (!definition.resourceVisuals || amount === undefined) return full;
  const fraction = amount <= 0 ? 0 : initial ? amount / initial : 1;
  return definition.resourceVisuals.stages.find(stage => fraction <= stage.remaining)?.asset ?? full;
}
