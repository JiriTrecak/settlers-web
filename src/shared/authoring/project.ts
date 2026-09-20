import raw from '../../../assets/authoring/catalogue.json';
import type {LandscapeAsset} from './catalogue';
import {compileMapScene,type CompiledMapScene} from './mapScene';
import type {UtcMap} from '../map/utcmap';
export const landscapeAssets=raw as LandscapeAsset[];
const scenes=new WeakMap<UtcMap,CompiledMapScene>();
/** Maps are immutable documents. Compile once per document identity, never per simulation tick. */
export function projectScene(map:UtcMap):CompiledMapScene|undefined{
 if(!map.authoring)return undefined;let scene=scenes.get(map);if(!scene){scene=compileMapScene(map,landscapeAssets);scenes.set(map,scene);}return scene;
}
