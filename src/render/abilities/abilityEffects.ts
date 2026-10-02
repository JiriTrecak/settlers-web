import {EffectPlayer} from './effectPlayer';
import {coreEffects,presentationRecipes} from '../../content/effects/library';
import type {AbilityPresentation} from '../../content/abilities/schema';
import type {AbilityEvent} from '../../sim/abilities/runtime';
import {Vector3} from 'three';
/** Simulation adapter. Visual playback itself has no simulation dependency. */
export class AbilityEffects extends EffectPlayer {
 constructor(private lookupEffects=()=>coreEffects){super();}
 consume(event:AbilityEvent,presentation:AbilityPresentation,height:(x:number,y:number)=>number=()=>0){this.emit(event,presentationRecipes(presentation,this.lookupEffects()),height);}
 syncDeliveries(deliveries:readonly import('../../sim/abilities/runtime').AbilityDeliveryView[],lookup:(id:string)=>AbilityPresentation|undefined,height:(x:number,y:number)=>number=()=>0){
  const live=new Set(deliveries.map(d=>d.cast));
  for(const cue of this.cues)if(['missile','wavefront'].includes(cue.recipe.shape)&&!live.has(cue.cast))this.remove(cue);
  this.cues=this.cues.filter(c=>c.root.parent);
  for(const d of deliveries){
   if(!this.cues.some(c=>c.cast===d.cast&&['missile','wavefront'].includes(c.recipe.shape))){
    const p=lookup(d.ability);if(p)this.consume({id:0,event:'projectile',cast:d.cast,ability:d.ability,tick:d.tick,caster:0,target:0,origin:d.position,point:d.position,viewers:[]},p,height);
   }
   for(const cue of this.cues.filter(c=>c.cast===d.cast&&['missile','wavefront'].includes(c.recipe.shape))){
    if(cue.flight?.tick===d.tick)continue;
    const position=new Vector3(d.position.x,height(d.position.x,d.position.y)+cue.recipe.height,d.position.y);
    cue.flight={previous:cue.flight?.position.clone()??position.clone(),position,direction:new Vector3(d.direction.x,0,d.direction.y),tick:d.tick};
   }
  }
 }
 syncStatuses(entities:readonly {id:number;x:number;y:number;hp?:number|null;spellStatuses?:readonly {ability:string;cast:number;source:number;started:number;expires:number;aura:boolean}[]}[],tick:number,lookup:(id:string)=>AbilityPresentation|undefined,height:(x:number,y:number)=>number=()=>0){
  const live=new Set(entities.flatMap(e=>(e.hp??1)>0?(e.spellStatuses??[]).filter(s=>s.expires>Math.floor(tick)).map(s=>`${e.id}:${s.ability}:${s.cast}`):[]));
  for(const cue of this.cues)if(cue.status&&!live.has(`${cue.entity}:${cue.ability}:${cue.cast}`))this.remove(cue);
  this.cues=this.cues.filter(c=>c.root.parent);
  for(const e of entities)for(const s of (e.hp??1)>0?e.spellStatuses??[]:[]){
   if(s.expires<=Math.floor(tick))continue;
   const presentation=lookup(s.ability);
   const recipes=presentation&&presentationRecipes(presentation,this.lookupEffects()).filter(r=>!this.cues.some(c=>c.status&&c.entity===e.id&&c.ability===s.ability&&c.cast===s.cast&&c.recipe.id===r.id));
   if(recipes)for(const recipe of recipes.filter(r=>r.event==='statusApplied'))this.emit({id:0,event:'statusApplied',cast:s.cast,tick:s.aura?(recipe.lifetime==='status'?0:Math.floor(tick/200)*200):s.started,ability:s.ability,caster:s.source,target:e.id,origin:e,point:e,durationTicks:s.aura?200:s.expires-s.started,viewers:[]},[recipe],height);
  }
 }
}
