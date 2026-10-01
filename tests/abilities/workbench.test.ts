import {it,expect} from 'vitest';
import {SpellEditorService} from '../../tooling/spell-editor/server/service';
import {coreAbilities} from '../../src/content/abilities/core';
import type {PreviewState} from '../../tooling/spell-editor/shared/view';
import type {SpellDocument} from '../../tooling/spell-editor/shared/protocol';
async function fixture(name:string,settings:Record<string,unknown>={}){
 const definition=structuredClone(coreAbilities.abilities.find(a=>a.id==='ability.core.'+name)!);
 const presentation=structuredClone(coreAbilities.presentations.find(p=>p.id===definition.presentation)!);
 delete presentation.icon;presentation.cues=presentation.cues.filter(c=>!c.texture);
 const document:SpellDocument={definition,presentation},service=new SpellEditorService('/tmp');
 await service.execute({op:'preview.load',document,settings:{relationship:'enemy',targetHealth:500,...settings}});
 return {service,document,state:()=>service.state() as PreviewState};
}
it('keeps passive auras absent until Cast grants the ability, then clears on Reset',async()=>{
 const f=await fixture('vampiric-aura',{relationship:'ally',targetCount:4,combat:true});
 await f.service.execute({op:'preview.play',playing:true});f.service.advance(250);
 expect(f.state().tick).toBe(0);expect(f.state().entities.every(e=>!e.spellStatuses?.length)).toBe(true);
 expect(await f.service.execute({op:'preview.cast'})).toMatchObject({accepted:true});
 expect(f.state().entities.every(e=>e.spellStatuses?.length===1)).toBe(true);
 await f.service.execute({op:'preview.reset'});expect(f.state().active).toBe(false);expect(f.state().entities.every(e=>!e.spellStatuses?.length)).toBe(true);
});
it('restarts every Cast with initial health and no mana/cooldown gating without editing the definition',async()=>{
 const f=await fixture('holy-light-lite',{relationship:'ally',targetHealth:40,mana:0});
 for(let i=0;i<3;i++){
  expect(await f.service.execute({op:'preview.cast'})).toMatchObject({accepted:true});
  expect(f.state().tick).toBe(0);expect(f.state().entities.find(e=>e.id===f.state().target)?.hp).toBe(40);
  await f.service.execute({op:'preview.step',ticks:30});expect(f.state().entities.find(e=>e.id===f.state().target)?.hp).toBe(140);
 }
 expect(f.state().document.definition.cast).toEqual(f.document.definition.cast);
});
it('targets the chosen unit and reconstructs identical outcomes in both scrub directions',async()=>{
 const f=await fixture('storm-bolt',{targetCount:3});const target=f.state().entities[3].id;
 await f.service.execute({op:'preview.target',entity:target});await f.service.execute({op:'preview.cast'});
 await f.service.execute({op:'preview.seek',tick:80});const end=f.state().checksum;
 expect(f.state().events.find(e=>e.event==='damaged')?.target).toBe(target);
 await f.service.execute({op:'preview.seek',tick:4});expect(f.state().entities.find(e=>e.id===target)?.hp).toBe(500);
 await f.service.execute({op:'preview.seek',tick:80});expect(f.state().checksum).toBe(end);expect(f.state().playing).toBe(false);
});
it('supports empty-ground spells and rejects unit spells without a target',async()=>{
 const f=await fixture('blizzard',{targetCount:0});expect(f.state().entities).toHaveLength(1);
 expect(await f.service.execute({op:'preview.cast'})).toMatchObject({accepted:true});await f.service.execute({op:'preview.seek',tick:65});expect(f.state().events.some(e=>e.event==='wave')).toBe(true);
 const g=await fixture('storm-bolt',{targetCount:0});expect(await g.service.execute({op:'preview.cast'})).toMatchObject({accepted:false});expect(g.state().active).toBe(false);
});
it('replays interruptions when seeking and starts a clean take on the next cast',async()=>{
 const f=await fixture('blizzard');await f.service.execute({op:'preview.cast'});await f.service.execute({op:'preview.step',ticks:70});await f.service.execute({op:'preview.stop'});await f.service.execute({op:'preview.step',ticks:40});
 const hash=f.state().checksum;await f.service.execute({op:'preview.seek',tick:10});await f.service.execute({op:'preview.seek',tick:110});expect(f.state().checksum).toBe(hash);expect(f.state().events.some(e=>e.event==='cancelled')).toBe(true);
 await f.service.execute({op:'preview.cast'});await f.service.execute({op:'preview.seek',tick:110});expect(f.state().events.some(e=>e.event==='cancelled')).toBe(false);
});
it('Cast resets immediately and waits for a canvas target before firing',async()=>{
 const f=await fixture('storm-bolt',{targetCount:3});
 await f.service.execute({op:'preview.cast'});await f.service.execute({op:'preview.seek',tick:80});
 expect(f.state().events.some(e=>e.event==='damaged')).toBe(true);
 await f.service.execute({op:'preview.beginCast'});
 expect(f.state()).toMatchObject({tick:0,active:false,targeting:true,playing:false,events:[],target:0});
 expect(f.state().entities.filter(e=>e.id!==f.state().caster).every(e=>e.hp===500&&!e.spellStatuses?.length)).toBe(true);
 f.service.advance(250);expect(f.state().tick).toBe(0);
 expect(await f.service.execute({op:'preview.confirmTarget',target:{kind:'unit',entity:0}})).toMatchObject({accepted:false,state:{targeting:true,active:false,tick:0}});
 const target=f.state().entities[3].id;
 expect(await f.service.execute({op:'preview.confirmTarget',target:{kind:'unit',entity:target}})).toMatchObject({accepted:true,state:{targeting:false,active:true,playing:true}});
 await f.service.execute({op:'preview.seek',tick:80});expect(f.state().events.find(e=>e.event==='damaged')?.target).toBe(target);
});
it('Cast aims point spells, fires self spells and auras immediately, and Reset cancels targeting',async()=>{
 const f=await fixture('blizzard',{targetCount:0});await f.service.execute({op:'preview.beginCast'});
 expect(f.state().targeting).toBe(true);
 expect(await f.service.execute({op:'preview.confirmTarget',target:{kind:'point',position:{x:128,y:120}}})).toMatchObject({accepted:true,state:{aim:{x:128,y:120},targeting:false}});
 await f.service.execute({op:'preview.beginCast'});await f.service.execute({op:'preview.reset'});
 expect(f.state()).toMatchObject({targeting:false,active:false,tick:0});
 await expect(f.service.execute({op:'preview.confirmTarget',target:{kind:'point',position:{x:128,y:120}}})).rejects.toThrow('Press Cast');
 for(const name of ['vampiric-aura','feral-spirit']){
  const g=await fixture(name,{relationship:'ally',combat:true});
  expect(await g.service.execute({op:'preview.beginCast'})).toMatchObject({accepted:true,state:{targeting:false,active:true}});
 }
});
it('keeps the chosen formation across spell loads and respawns it on Cast',async()=>{
 const {applyEncounterPreset,encounterSettingsSchema}=await import('../../src/content/abilities/encounter');
 const settings=applyEncounterPreset(encounterSettingsSchema.parse({}),'ally-group');
 const f=await fixture('holy-light-lite',settings);
 const before=f.state().entities.map(e=>({owner:e.owner,x:e.x,y:e.y,hp:e.hp,model:e.modelDefinition}));
 const g=await fixture('feral-spirit',settings);
 await f.service.execute({op:'preview.load',document:g.document,settings});
 expect(f.state().settings).toEqual(settings);
 expect(f.state().entities.map(e=>({owner:e.owner,x:e.x,y:e.y,hp:e.hp,model:e.modelDefinition}))).toEqual(before);
 await f.service.execute({op:'preview.kill',subject:'target'});await f.service.execute({op:'preview.beginCast'});
 expect(f.state().entities.map(e=>({owner:e.owner,x:e.x,y:e.y,hp:e.hp,model:e.modelDefinition}))).toEqual(before);
});
it('spawns a mixed neutral camp that enemy spells can hit and reset restores',async()=>{
 const {applyEncounterPreset,encounterSettingsSchema}=await import('../../src/content/abilities/encounter');
 const settings=applyEncounterPreset(encounterSettingsSchema.parse({}),'neutral-camp');
 const f=await fixture('storm-bolt',settings);const targets=f.state().entities.filter(e=>e.id!==f.state().caster);
 expect(targets).toHaveLength(5);expect(targets.every(e=>e.owner==='none')).toBe(true);expect(new Set(targets.map(e=>e.modelDefinition)).size).toBe(3);
 await f.service.execute({op:'preview.beginCast'});
 expect(await f.service.execute({op:'preview.confirmTarget',target:{kind:'unit',entity:targets[0].id}})).toMatchObject({accepted:true});
 await f.service.execute({op:'preview.seek',tick:80});expect(f.state().events.find(e=>e.event==='damaged')?.target).toBe(targets[0].id);
 await f.service.execute({op:'preview.beginCast'});expect(f.state().entities.filter(e=>e.owner==='none').every(e=>e.hp===500)).toBe(true);
});
it('passive targets keep their positions and health while summons and melee auras still work',async()=>{
 const f=await fixture('feral-spirit',{combat:false,distance:2,targetCount:3});
 const initial=f.state().entities.map(e=>({id:e.id,x:e.x,y:e.y,hp:e.hp}));
 await f.service.execute({op:'preview.beginCast'});await f.service.execute({op:'preview.step',ticks:80});
 expect(f.state().entities.filter(e=>initial.some(i=>i.id===e.id)).map(e=>({id:e.id,x:e.x,y:e.y,hp:e.hp}))).toEqual(initial);
 expect(f.state().events.some(e=>e.event==='summoned')).toBe(true);
 const summons=f.state().entities.filter(e=>!initial.some(i=>i.id===e.id)).map(e=>({id:e.id,x:e.x,y:e.y,hp:e.hp}));
 expect(summons).toHaveLength(2);await f.service.execute({op:'preview.step',ticks:120});
 expect(f.state().entities.filter(e=>summons.some(i=>i.id===e.id)).map(e=>({id:e.id,x:e.x,y:e.y,hp:e.hp}))).toEqual(summons);
 const aura=await fixture('vampiric-aura',{relationship:'ally',combat:false,targetCount:3});
 await aura.service.execute({op:'preview.beginCast'});expect(aura.state().entities.every(e=>e.spellStatuses?.length===1)).toBe(true);
});
it('combat scenarios opt in to ordinary weapon fighting',async()=>{
 const f=await fixture('vampiric-aura',{relationship:'enemy',combat:true,distance:2});const before=f.state().entities.map(e=>e.hp);
 await f.service.execute({op:'preview.beginCast'});await f.service.execute({op:'preview.step',ticks:120});
 expect(f.state().entities.map(e=>e.hp)).not.toEqual(before);
});
