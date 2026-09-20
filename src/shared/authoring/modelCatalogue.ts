import {resourceFilename,type AssetDefinition} from './asset';

/** Shared authored transform. Placement scale/rotation are applied outside this transform. */
export type ModelTransform=AssetDefinition['transform'];
export type ModelPlacement={transform:ModelTransform;groundContact?:NonNullable<AssetDefinition['capabilities']['groundContact']>['mode']};
export type PublishedModel=ModelPlacement&{id:string;geometry:string[];scenery:string[]};

export function modelCatalogue(assets:readonly AssetDefinition[]):PublishedModel[]{
 return assets.filter(a=>a.status==='published'&&a.usesGeometry).map(a=>({
  id:a.id,transform:a.transform,
  ...(a.capabilities.groundContact?{groundContact:a.capabilities.groundContact.mode}:{}),
  geometry:a.resources.filter(r=>r.role==='geometry').map(r=>`assets/library/${a.id}/${resourceFilename(r)}`),
  scenery:a.bindings.scenery.map(s=>s.id),
 }));
}
