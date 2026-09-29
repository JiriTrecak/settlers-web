import {resourceFilename,type AssetDefinition} from './asset';

/** Shared authored transform. Placement scale/rotation are applied outside this transform. */
export type ModelTransform=AssetDefinition['transform'];
/** `canopy` marks giant overhanging foliage; only those crowns dissolve around units behind them. */
export type ModelPlacement={transform:ModelTransform;groundContact?:NonNullable<AssetDefinition['capabilities']['groundContact']>['mode'];canopy?:true};
export type PublishedModel=ModelPlacement&{id:string;geometry:string[];scenery:string[];capabilities?:AssetDefinition['capabilities']};

export function modelCatalogue(assets:readonly AssetDefinition[]):PublishedModel[]{
 return assets.filter(a=>a.status==='published'&&a.usesGeometry).map(a=>({
  id:a.id,transform:a.transform,
  ...(Object.keys(a.capabilities).length?{capabilities:a.capabilities}:{}),
  ...(a.capabilities.groundContact?{groundContact:a.capabilities.groundContact.mode}:{}),
  ...(a.capabilities.canopy?{canopy:true as const}:{}),
  geometry:a.resources.filter(r=>r.role==='geometry').map(r=>`assets/library/${a.id}/${resourceFilename(r)}`),
  scenery:a.bindings.scenery.map(s=>s.id),
 }));
}
