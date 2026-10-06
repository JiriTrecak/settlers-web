import {content} from '../../../src/content/builtin';
import type {AssetDefinition} from '../../../src/shared/authoring/asset';
import {resourceDepositAssets} from '../../../src/render/settlement/resourceDepositVisual';

/** Inspect the first geometry binding at its game definition's presentation size.
 * Assets without a game definition retain their authored size. Spell scenes
 * with an actual entity use that entity's definition instead. */
export function previewModelScale(asset:AssetDefinition,registry=content) {
 const binding=asset.bindings.render.find(b=>b.geometry);
 const definition=binding&&registry.definitions.find(d=>resourceDepositAssets(d.id,d.asset).includes(binding.id));
 return (binding?.scale??1)*(definition?.modelScale??1);
}
