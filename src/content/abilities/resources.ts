import {coreEffects,presentationRecipes} from '../effects/library';
import {publishedAssets} from '../../shared/assets/manifest';
import type {AbilityPresentation} from './schema';
export type EffectTextureRef=NonNullable<import('../effects/schema').VisualLayer['texture']>;
export type EffectResourceRef=EffectTextureRef|Pick<NonNullable<import('../effects/schema').VisualLayer['sound']>,'asset'|'role'|'index'>|Pick<NonNullable<import('../effects/schema').VisualLayer['model']>,'asset'|'role'|'index'>;
export function effectResource(ref:EffectResourceRef){
 const asset=publishedAssets.find(a=>a.id===ref.asset),name=`${ref.role}${ref.index===1?'':'_'+ref.index}.`;
 const image=asset?.outputs.find(o=>o.path.split('/').at(-1)?.startsWith(name));
 if(!image)throw Error(`Missing published effect ${ref.role} ${ref.asset}/${ref.role}:${ref.index}`);
 return image;
}
export const effectImage=(ref:EffectTextureRef)=>effectResource(ref);
export function layerResources(layer:Pick<import('../effects/schema').VisualLayer,'texture'|'sound'|'model'>):EffectResourceRef[]{return [...(layer.texture?[layer.texture]:[]),...(layer.sound?[{asset:layer.sound.asset,role:layer.sound.role,index:layer.sound.index}]:[]),...(layer.model?[{asset:layer.model.asset,role:layer.model.role,index:layer.model.index}]:[])];}

/** Images carried by a spell release, including its command icon. */
export function presentationImages(presentation:AbilityPresentation,effects=coreEffects):EffectTextureRef[]{return [...(presentation.icon?[{asset:presentation.icon,role:"image" as const,index:1}]:[]),...presentationRecipes(presentation,effects).flatMap(c=>c.texture?[c.texture]:[])];}
export function presentationResources(presentation:AbilityPresentation,effects=coreEffects):EffectResourceRef[]{return [...(presentation.icon?[{asset:presentation.icon,role:'image' as const,index:1}]:[]),...presentationRecipes(presentation,effects).flatMap(layerResources)];}
