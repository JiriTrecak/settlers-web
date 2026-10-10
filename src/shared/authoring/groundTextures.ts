import raw from '../../../assets/authoring/catalogue.json';
import type {LandscapeAsset} from './catalogue';
/** Ground materials are ordinary asset declarations, not biome slots or packs. */
export const groundTextures=new Map((raw as LandscapeAsset[]).filter(a=>a.terrain).map(a=>[a.id,a]));

export const isCliffMaterial=(id:string)=>groundTextures.get(id)?.terrain?.projection?.type==='cliff';
