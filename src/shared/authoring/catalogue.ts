import type {AssetDefinition} from './asset';
import type {GenerationAssets} from './generate';
import type {LandscapeRecipe,WaterProfile} from './recipes';

/** Small runtime index. Binary files and authoring histories never enter this index. */
export type LandscapeAsset={id:string;name:string;kind:AssetDefinition['kind'];scenery?:string;scale:number;clearance:number;recipe?:LandscapeRecipe;water?:WaterProfile};
export function landscapeCatalogue(assets:readonly AssetDefinition[]):LandscapeAsset[]{
 return assets.filter(a=>a.status==='published'&&(a.usesGeometry||a.recipe||a.water)).map(a=>({id:a.id,name:a.name,kind:a.kind,scenery:a.bindings.scenery[0]?.id,scale:a.transform.scale,clearance:a.capabilities.vegetationClearance??0,...(a.recipe?{recipe:a.recipe}:{}),...(a.water?{water:a.water}:{})}));
}
export function generationAssets(catalogue:readonly LandscapeAsset[]):GenerationAssets{
 const index=new Map(catalogue.map(a=>[a.id,a]));
 return {recipe:id=>index.get(id)?.recipe,clearance:id=>index.get(id)?.clearance??0};
}
