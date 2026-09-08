import type { ResourceKind } from './rules';

/** Simulation-owned asset semantics: decorative scenery never implies stock.
 * Legacy names remain readable for saved maps; no renderer/catalog access.
 */
export function resourceKindForAsset(asset:string):ResourceKind|null {
  if (/^ant-pine-[123]$/.test(asset) || /^(pine-chunky|tree-chunky)/.test(asset)) return 'wood';
  if (asset==='ant-stone-deposit' || asset==='rock-rounded-cool') return 'stone';
  return null;
}
