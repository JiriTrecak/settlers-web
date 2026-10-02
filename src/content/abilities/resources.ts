import {coreEffects,presentationRecipes} from '../effects/library';
import {publishedAssets} from '../../shared/assets/manifest';
import type {AbilityPresentation} from './schema';
export type EffectTextureRef=NonNullable<import('../effects/schema').VisualLayer['texture']>;
export function effectImage(ref:EffectTextureRef){
 const asset=publishedAssets.find(a=>a.id===ref.asset),name=`image${ref.index===1?'':'_'+ref.index}.`;
 const image=asset?.outputs.find(o=>o.path.split('/').at(-1)?.startsWith(name));
 if(!image)throw Error(`Missing published effect image ${ref.asset}/${ref.role}:${ref.index}`);
 return image;
}

/** Images carried by a spell release, including its command icon. */
export function presentationImages(presentation:AbilityPresentation,effects=coreEffects):EffectTextureRef[]{return [...(presentation.icon?[{asset:presentation.icon,role:"image" as const,index:1}]:[]),...presentationRecipes(presentation,effects).flatMap(c=>c.texture?[c.texture]:[])];}
