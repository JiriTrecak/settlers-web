import {Group,type Vector3} from 'three';
import {content} from '../../content/builtin';
import {coreEffects} from '../../content/effects/library';
import type {VisualEffect} from '../../content/effects/schema';
import type {Shell} from '../../sim/game/shellState';
import type {HeightField} from '../../shared/map/height';
import {EffectPlayer} from '../abilities/effectPlayer';
import {loadEffectModel} from '../abilities/effectModel';
import {ProjectileEffects,type WeaponFlight} from './projectileEffects';

/** Fixed-target shell simulation with editor-authored flight and impact visuals. */
export class ShellEffects {
 readonly root=new Group();
 readonly ready:Promise<void>;
 private readonly flights:ProjectileEffects;
 private readonly impacts:EffectPlayer;
 private readonly effects=new Map<string,VisualEffect>();
 private readonly seen=new Map<number,number>();
 private lastTick=-1;
 constructor(parent:Group,private readonly registry=content,effects:readonly VisualEffect[]=coreEffects,loader=loadEffectModel,impacts=new EffectPlayer()){
  parent.add(this.root);this.impacts=impacts;this.root.add(impacts.root);
  const bindings=registry.definitions.filter(d=>d.behaviors.combat?.shell).map(d=>registry.asset(d.asset));
  for(const binding of bindings){
   if(!binding.projectile||!binding.impactEffect)throw Error('Shell weapon needs declared projectile and impact effects: '+binding.id);
   const effect=effects.find(e=>e.id===binding.impactEffect);if(!effect)throw Error('Missing shell impact effect '+binding.impactEffect);
   this.effects.set(binding.impactEffect,effect);
  }
  this.flights=new ProjectileEffects(this.root,registry,effects,loader,bindings.map(b=>b.projectile!));
  // Prepare real impact materials and retain their resources for later volleys.
  this.ready=Promise.all([this.flights.ready,impacts.prepare([...this.effects.values()])]).then(()=>{});
  void this.ready.catch(error=>console.error('Shell effects could not load',error));
 }
 preparedModels(){return this.impacts.preparedModelsForWarmup();}
 update(shells:readonly Shell[],field:HeightField,tick:number,launchPosition?:(shell:Shell)=>Vector3|undefined){
  if(tick<this.lastTick){this.seen.clear();this.impacts.clear();}this.lastTick=tick;
  const byId=new Map(shells.map(s=>[s.id,s]));
  for(const id of this.seen.keys())if(!byId.has(id))this.seen.delete(id);
  const flights:WeaponFlight[]=shells.map(s=>({...s,destination:s.target,groundImpact:true}));
  this.flights.update(tick,flights,field,launchPosition?s=>launchPosition(byId.get(s.id)!):undefined);
  for(const shell of shells){
   if(tick<shell.impact||this.seen.get(shell.id)===shell.launched)continue;
   this.seen.set(shell.id,shell.launched);
   const binding=this.registry.asset(this.registry.get(shell.definition).asset),effect=this.effects.get(binding.impactEffect!)!;
   this.impacts.play(effect,{tick:shell.impact,seed:shell.id,target:{...shell.target,height:field.walkSample(shell.target.x,shell.target.y,shell.target.surface)},radius:shell.radius});
  }
  this.impacts.update(tick);
 }
 dispose(){this.flights.dispose();this.impacts.dispose();this.seen.clear();this.root.removeFromParent();this.root.clear();}
}
