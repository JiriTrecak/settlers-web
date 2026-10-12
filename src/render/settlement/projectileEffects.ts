import type { GameState } from "../../sim/game/state";
import type { HeightField } from "../../shared";
import { content } from "../../content/builtin";
import {Group,Matrix4,Quaternion,Vector3} from 'three';
import {StaticEffectBatch} from '../abilities/staticEffectBatch';
import {coreEffects} from '../../content/effects/library';
import {weaponProjectileLayers,type VisualEffect} from '../../content/effects/schema';
import {WEAPON_EFFECT_LIMITS} from '../../content/effects/limits';
import {loadEffectModel} from '../abilities/effectModel';

type Flight={scale:number;cast?:number;effect:string;start:Vector3;end:Vector3;tick:number;duration:number};
export type WeaponFlight=Pick<GameState['missiles'][number],'id'|'source'|'definition'|'origin'|'destination'|'launched'|'impact'|'enhancement'> & {groundImpact?:boolean};
const UP=new Vector3(0,1,0);
/** Observer-filtered authoritative flights. One draw per model primitive, never one per shot. */
export class ProjectileEffects {
 readonly root=new Group();
 private readonly batches=new Map<string,StaticEffectBatch[]>();
 readonly ready:Promise<void>;
 private flights:Flight[]=[];
 private readonly effectPoses=new Map<number,{position:Vector3;direction:Vector3}>();
 /** Read-only world pose shared with linked spell VFX; never a second flight calculation. */
 effectPose=(cast:number)=>this.effectPoses.get(cast);
 private readonly origins=new Map<number,{launched:number;position:Vector3}>();
 private readonly position=new Vector3();
 private readonly scale=new Vector3(1,1,1);
 private readonly tangent=new Vector3();
 private readonly rotation=new Quaternion();
 private readonly matrix=new Matrix4();
 // Eager loading lets the normal scene warm-up compile flight materials before the first volley.
 constructor(parent:Group,private readonly registry=content,effects:readonly VisualEffect[]=coreEffects,loader=loadEffectModel,effectIds?:readonly string[]){
  const plans=[...new Set(effectIds??registry.assets.flatMap(a=>a.projectile?[a.projectile]:[]))].map(id=>{
   const effect=effects.find(e=>e.id===id);if(!effect)throw Error('Missing projectile effect '+id);
   return {id,layers:weaponProjectileLayers(effect)};
  });
  parent.add(this.root);
  for(const {id,layers} of plans){
   const batches=layers.map(layer=>{const batch=new StaticEffectBatch(layer,loader);batch.root.name=`projectiles.${id}/${layer.id}`;this.root.add(batch.root);return batch;});this.batches.set(id,batches);
  }
  this.ready=Promise.all([...this.batches.values()].flat().map(b=>b.ready)).then(()=>{}).catch(error=>{this.dispose();throw error;});
  void this.ready.catch(error=>console.error('Projectile effects could not load',error));
 }
 update(tick:number, missiles:readonly WeaponFlight[], field:HeightField, launchPosition?:(missile:WeaponFlight)=>Vector3|undefined){
  this.effectPoses.clear();
  const active=missiles.filter(m=>tick>=m.launched&&tick<m.impact).slice(0,WEAPON_EFFECT_LIMITS.flights);
  const liveIds=new Set(active.map(m=>m.id));
  for(const id of this.origins.keys())if(!liveIds.has(id))this.origins.delete(id);
  this.flights=active.map(m=>{
   let cached=this.origins.get(m.id);
   if(!cached||cached.launched!==m.launched){
    // Only a fresh launch can sample the animated bow. Late observations use
    // the recorded origin, never a shooter who has since moved elsewhere.
    const position=(tick<=m.launched+1?launchPosition?.(m):undefined)?.clone()
     ?? new Vector3(m.origin.x,field.walkSample(m.origin.x,m.origin.y,m.origin.surface)+1.5+(m.origin.elevation??0),m.origin.y);
    cached={launched:m.launched,position};this.origins.set(m.id,cached);
   }
   return {
    cast:m.enhancement?.cast,scale:this.registry.get(m.definition).modelScale??1,effect:this.registry.asset(this.registry.get(m.definition).asset).projectile!,
    start:cached.position,
    end:new Vector3(m.destination.x,field.walkSample(m.destination.x,m.destination.y,m.destination.surface)+(m.groundImpact?.1:1)+(m.destination.elevation??0),m.destination.y),
    tick:m.launched,duration:m.impact-m.launched,
   };
  });
  const counts=new Map<string,number>();for(const flight of this.flights)counts.set(flight.effect,(counts.get(flight.effect)??0)+1);
  for(const [id,batches] of this.batches)for(const batch of batches)batch.begin(counts.get(id)??0);
  for(const flight of this.flights){
   const batches=this.batches.get(flight.effect);if(!batches)throw Error('Undeclared projectile effect for weapon: '+flight.effect);
   const t=Math.max(0,(tick-flight.tick)/flight.duration),arc=batches[0]!.layer.arcHeight??0;
   this.position.lerpVectors(flight.start,flight.end,t);this.position.y+=4*arc*t*(1-t);
   this.tangent.subVectors(flight.end,flight.start);this.tangent.y+=4*arc*(1-2*t);
   if(this.tangent.lengthSq()<1e-10)this.tangent.copy(UP);else this.tangent.normalize();
   if(flight.cast!==undefined)this.effectPoses.set(flight.cast,{position:this.position.clone(),direction:this.tangent.clone()});
   this.scale.setScalar(flight.scale);this.rotation.setFromUnitVectors(UP,this.tangent);this.matrix.compose(this.position,this.rotation,this.scale);
   for(const batch of batches)batch.append(this.matrix);
  }
  for(const batches of this.batches.values())for(const batch of batches)batch.flush();
 }
 dispose(){for(const batches of this.batches.values())for(const b of batches)b.dispose();this.batches.clear();this.flights=[];this.origins.clear();this.effectPoses.clear();this.root.clear();this.root.removeFromParent();}
}
