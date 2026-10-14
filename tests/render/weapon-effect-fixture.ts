/** Shared test-owned fixture for weapon flight and shell impact presentation.
 * Units, assets and flight effects come from the test world; models are code-built boxes, so no shipped GLB or
 * published effect resource is read. */
import {BoxGeometry,Group,Mesh,MeshStandardMaterial} from 'three';
import {ContentRegistry} from '../../src/content/registry';
import type {AuthoredDefinition} from '../../src/content/schema';
import {visualEffectSchema,type VisualEffect} from '../../src/content/effects/schema';
import type {EffectModelSource} from '../../src/render/abilities/effectModel';
import {testEffects,testSource} from '../fixtures/content';

/** Archer-style straight shot, thorn shot and a shell weapon, all declared in the test world. */
export const ARCHER='unit.test.archer',THORN_SHOOTER='unit.test.neutral-spitter',SHELL_SHOOTER='unit.test.bombardier';

/** Resource-free impact (glow + light) so impacts never resolve published textures. */
const impact=(id:string)=>visualEffectSchema.parse({schemaVersion:1,id,name:'Test shell impact',durationTicks:32,layers:[
 {id:'glow',shape:'glow',anchor:'target',colour:'#ffbe61',accent:'#ffffff',durationTicks:32,count:1,size:3,height:1},
 {id:'flash',shape:'light',anchor:'target',colour:'#ffbe61',accent:'#ffbe61',durationTicks:6,count:1,size:3,height:1,intensity:3},
]});

/** Test effects with every shell impact replaced by a resource-free variant. */
export function weaponEffects(registry:ContentRegistry=weaponRegistry()):VisualEffect[]{
 const impacts=new Set(registry.assets.flatMap(a=>a.impactEffect?[a.impactEffect]:[]));
 return testEffects.map(e=>impacts.has(e.id)?impact(e.id):e);
}

/** A registry over the test world, optionally edited (e.g. per-unit modelScale). */
export function weaponRegistry(edit?:(definitions:AuthoredDefinition[])=>void){
 const raw=testSource();edit?.(raw.definitions as AuthoredDefinition[]);return new ContentRegistry(raw);
}

/** The flight effect a unit fires, resolved through its asset like the renderer does. */
export function flightEffect(registry:ContentRegistry,effects:readonly VisualEffect[],unit:string){
 const id=registry.asset(registry.get(unit).asset).projectile!;
 return {id,effect:effects.find(e=>e.id===id)!};
}

/** Synthetic effect model loader: one unit box per requested model, identity transform. */
export async function syntheticEffectModel():Promise<EffectModelSource>{
 const scene=new Group();scene.add(new Mesh(new BoxGeometry(),new MeshStandardMaterial()));
 return {scene,animations:[],transform:{scale:1,pivot:[0,0,0],up:'Y',forward:'+Z'}};
}
