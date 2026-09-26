import raw from '../../../assets/authoring/catalogue.json';
import type {LandscapeAsset} from './catalogue';
import {compileMapScene,type CompiledMapScene} from './mapScene';
import type {UtcMap} from '../map/utcmap';
export const landscapeAssets=raw as LandscapeAsset[];
const scenes=new WeakMap<UtcMap,CompiledMapScene>();
const landscapes=new WeakMap<NonNullable<UtcMap['authoring']>,{inputs:unknown[];scene:CompiledMapScene}>();
/** Only landscape inputs invalidate generation. Units, names, weather and starts do not. */
export function sceneInputs(map:UtcMap):unknown[]{return [map.biome,map.authoring,map.height,map.waterLevel,map.landscape?.importedTerrain,map.stamps,map.size];}
export function rememberProjectScene(map:UtcMap,scene:CompiledMapScene):void{
 scenes.set(map,scene);if(map.authoring)landscapes.set(map.authoring,{inputs:sceneInputs(map),scene});
}
export function projectScene(map:UtcMap):CompiledMapScene|undefined{
 if(!map.authoring)return undefined;
 const cached=scenes.get(map);if(cached)return cached;
 const previous=landscapes.get(map.authoring),inputs=sceneInputs(map);
 const scene=previous&&inputs.every((v,i)=>v===previous.inputs[i])?previous.scene:compileMapScene(map,landscapeAssets);
 rememberProjectScene(map,scene);return scene;
}
