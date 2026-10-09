import {expect,it} from 'vitest';
import {AbilityEffects} from '../../src/render/abilities/abilityEffects';
import {coreEffects} from '../../src/content/effects/library';
import {presentationSchema} from '../../src/content/abilities/schema';

const attachedEffects=['effect.marshal.rally.cast','effect.marshal.rally.recipient','effect.marshal.carapace.armor','effect.marshal.rally.ward','effect.core.frost-arrows.chill','effect.assistant-trials.frost-relay.chill','effect.core.wind-walk','effect.core.invisibility','effect.core.true-sight','effect.core.battle-rhythm.momentum','effect.core.doom.curse','effect.core.black-arrow.mark','effect.core.animate-dead.ward'];
it.each(attachedEffects)('%s keeps every attached layer with its recipient and cleans up on status loss',id=>{
 const effect=coreEffects.find(e=>e.id===id)!;expect(effect).toBeDefined();
 const presentation=presentationSchema.parse({schemaVersion:1,id:'presentation.test.follow',animations:{prepare:'idle',release:'idle',recover:'idle',fallback:'idle'},effects:[{id:'attached',effect:id,event:'statusApplied',anchor:'target',lifetime:'status',statusId:'mark'}]});
 const fx=new AbilityEffects(()=>[effect]);
 const actor={id:2,x:10,y:20,hp:100,spellStatuses:[{ability:'ability.test.follow',status:'mark',cast:1,source:1,started:0,expires:200,aura:false}]};
 const anchor=(id:number)=>id===actor.id?{x:actor.x,y:actor.y,height:3}:undefined;
 try{
  fx.syncStatuses([actor],10,()=>presentation);fx.update(10,anchor);
  expect(fx.rootsForEntity(actor.id)).toHaveLength(effect.layers.filter(l=>l.enabled).length);
  actor.x=25;actor.y=35;fx.syncStatuses([actor],11,()=>presentation);fx.update(11,anchor);
  for(const [index,root] of fx.rootsForEntity(actor.id).entries()){
   const layer=effect.layers.filter(l=>l.enabled)[index];expect(root.position.x).toBeCloseTo(actor.x+(layer.offset?.x??0));expect(root.position.z).toBeCloseTo(actor.y+(layer.offset?.z??0));expect(root.position.y).toBeCloseTo(3.035+(layer.offset?.y??0));
  }
  actor.spellStatuses=[];fx.syncStatuses([actor],12,()=>presentation);fx.update(12,anchor);expect(fx.liveCues).toBe(0);
 }finally{fx.dispose();}
});
