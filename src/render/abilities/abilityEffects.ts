import {TrailHistory,type TrailSnapshot} from '../../shared/effects/trailHistory';
import {EffectPlayer,type EffectAnchor} from './effectPlayer';
import {coreEffects,presentationRecipes} from '../../content/effects/library';
import type {AbilityPresentation} from '../../content/abilities/schema';
import type {AbilityEvent} from '../../sim/abilities/runtime';
import {Vector3} from 'three';
/** Simulation adapter. Visual playback itself has no simulation dependency. */
export class AbilityEffects extends EffectPlayer {
 private trailHistory=new TrailHistory();
 override clear(){super.clear();this.trailHistory.clear();}
 constructor(private lookupEffects=()=>coreEffects){super();}
 consume(event:AbilityEvent,presentation:AbilityPresentation,height:(x:number,y:number)=>number=()=>0,anchor?:EffectAnchor){this.emit({...event,origin:{...event.origin,height:event.origin.height??anchor?.(event.caster)?.height},point:{...event.point,height:event.point.height??anchor?.(event.target)?.height}},presentationRecipes(presentation,this.lookupEffects()),height);}
 syncDeliveries(deliveries:readonly import('../../sim/abilities/runtime').AbilityDeliveryView[],lookup:(id:string)=>AbilityPresentation|undefined,height:(x:number,y:number)=>number=()=>0,history?:readonly TrailSnapshot[]){
  const tick=deliveries[0]?.tick;if(tick!==undefined)this.trailHistory.record(tick,deliveries.map(d=>({cast:d.cast,x:d.position.x,y:d.position.height??height(d.position.x,d.position.y),z:d.position.y})));
  if(!deliveries.length)this.trailHistory.clear();
  const paths=history??this.trailHistory.snapshot();
  const live=new Set(deliveries.map(d=>d.cast));
  for(const cue of this.cues)if(['missile','wavefront'].includes(cue.recipe.shape)&&!live.has(cue.cast))this.remove(cue);
  this.cues=this.cues.filter(c=>c.root.parent);
  for(const d of deliveries){
   if(!this.cues.some(c=>c.cast===d.cast&&['missile','wavefront'].includes(c.recipe.shape))){
    const p=lookup(d.ability);if(p)this.consume({id:0,event:'projectile',cast:d.cast,ability:d.ability,tick:d.tick,caster:0,target:0,origin:d.position,point:d.position,viewers:[]},p,height);
   }
   for(const cue of this.cues.filter(c=>c.cast===d.cast&&['missile','wavefront'].includes(c.recipe.shape))){
    if(cue.trail)cue.trailPoints=paths.find(p=>p.cast===d.cast)?.points.map(p=>({...p,y:p.y+cue.recipe.height}));
    if(cue.flight?.tick===d.tick)continue;
    const position=new Vector3(d.position.x,(d.position.height??height(d.position.x,d.position.y))+cue.recipe.height,d.position.y);
    cue.flight={previous:cue.flight?.position.clone()??position.clone(),position,direction:new Vector3(d.direction.x,d.direction.height??0,d.direction.y),tick:d.tick};
   }
  }
 }
 syncReturns(returns:readonly import('../../sim/abilities/runtime').HeroReturnView[],tick:number,lookup:(id:string)=>AbilityPresentation|undefined,height:(x:number,y:number)=>number=()=>0){
  const live=new Set(returns.map(r=>r.cast));
  for(const cue of this.cues)if(cue.recipe.event==='revivalStarted'&&!live.has(cue.cast))this.remove(cue);
  this.cues=this.cues.filter(c=>c.root.parent);
  for(const r of returns){
   if(tick>=r.due)continue;const presentation=lookup(r.ability);if(!presentation)continue;
   const recipes=presentationRecipes(presentation,this.lookupEffects()).filter(recipe=>recipe.event==='revivalStarted'&&!this.cues.some(c=>c.cast===r.cast&&c.recipe.id===recipe.id));
   if(recipes.length)this.emit({id:0,event:'revivalStarted',cast:r.cast,ability:r.ability,tick:r.started,caster:r.id,target:r.id,origin:r,point:r,durationTicks:r.due-r.started,viewers:[]},recipes,height);
  }
 }
 syncStatuses(entities:readonly {id:number;x:number;y:number;elevation?:number;hp?:number|null;spellStatuses?:readonly {ability:string;status?:string;cast:number;source:number;started:number;expires:number;aura:boolean}[]}[],tick:number,lookup:(id:string)=>AbilityPresentation|undefined,height:(x:number,y:number)=>number=()=>0){
  const live=new Set(entities.flatMap(e=>(e.hp??1)>0?(e.spellStatuses??[]).filter(s=>s.expires>Math.floor(tick)).map(s=>`${e.id}:${s.ability}:${s.cast}:${s.status??''}`):[]));
  for(const cue of this.cues)if(cue.status&&!live.has(`${cue.entity}:${cue.ability}:${cue.cast}:${cue.statusId??''}`))this.remove(cue);
  this.cues=this.cues.filter(c=>c.root.parent);
  for(const e of entities)for(const s of (e.hp??1)>0?e.spellStatuses??[]:[]){
   if(s.expires<=Math.floor(tick))continue;
   const presentation=lookup(s.ability);
   const recipes=presentation&&presentationRecipes(presentation,this.lookupEffects()).filter(r=>!this.cues.some(c=>c.status&&c.entity===e.id&&c.ability===s.ability&&c.cast===s.cast&&c.statusId===s.status&&c.recipe.id===r.id));
   if(recipes)for(const recipe of recipes.filter(r=>r.event==='statusApplied'&&(!r.statusId||r.statusId===s.status)))this.emit({id:0,event:'statusApplied',cast:s.cast,tick:s.aura?(recipe.lifetime==='status'?0:Math.floor(tick/200)*200):s.started,ability:s.ability,statusId:s.status,caster:s.source,target:e.id,origin:{...e,height:height(e.x,e.y)+(e.elevation??0)},point:{...e,height:height(e.x,e.y)+(e.elevation??0)},durationTicks:s.aura?200:s.expires-s.started,viewers:[]},[recipe],height);
  }
 }
}
