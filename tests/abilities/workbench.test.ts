import {it,expect} from 'vitest';
import {SpellEditorService} from '../../tooling/spell-editor/server/service';
import {coreAbilities} from '../../src/content/abilities/core';
import {UNTIL_DEATH} from '../../src/sim/abilities/state';
import type {PreviewState} from '../../tooling/spell-editor/shared/view';
import type {SpellDocument} from '../../tooling/spell-editor/shared/protocol';
async function fixture(name:string,settings:Record<string,unknown>={}){
 const definition=structuredClone(coreAbilities.abilities.find(a=>a.id==='ability.core.'+name)!);
 const presentation=structuredClone(coreAbilities.presentations.find(p=>p.id===definition.presentation)!);
 delete presentation.icon;presentation.effects=[];
 const document:SpellDocument={definition,presentation},service=new SpellEditorService('/tmp');
 await service.execute({op:'preview.load',document,settings:{relationship:'enemy',targetHealth:500,...settings}});
 return {service,document,state:()=>service.state() as PreviewState};
}
it('displaces an explicit caster, replays the intervention, and rejects a missing subject without recording it',async()=>{
 const f=await fixture('spirit-swarm',{distance:6,casterHealth:100});
 await f.service.execute({op:'preview.cast'});await f.service.execute({op:'preview.seek',tick:20});
 const caster=f.state().caster,before=f.state().entities.find(e=>e.id===caster)!;
 await f.service.execute({op:'preview.displace',subject:'caster',distance:8});
 expect(f.state().entities.find(e=>e.id===caster)!.x).toBe(before.x+8);
 await f.service.execute({op:'preview.seek',tick:26});const first=f.state();
 await f.service.execute({op:'preview.seek',tick:10});await f.service.execute({op:'preview.seek',tick:26});
 expect(f.state().checksum).toBe(first.checksum);expect(f.state().deliveries).toEqual(first.deliveries);
 await f.service.execute({op:'preview.kill',subject:'caster'});
 const dead=f.state();await expect(f.service.execute({op:'preview.displace',subject:'caster',distance:8})).rejects.toThrow('living caster and subject');
 expect(f.state().checksum).toBe(dead.checksum);
 await f.service.execute({op:'preview.seek',tick:10});await f.service.execute({op:'preview.seek',tick:26});expect(f.state().checksum).toBe(dead.checksum);
});
it('exposes actual resolved combat stats before, during and after a ward for authoring verification',async()=>{
 const f=await fixture('frost-armor',{relationship:'ally'}),target=f.state().target;
 const stats=()=>f.state().entities.find(e=>e.id===target)!.stats!;
 const initial=stats();expect(initial.armor).toBeTypeOf('number');
 await f.service.execute({op:'preview.cast'});await f.service.execute({op:'preview.seek',tick:40});expect(stats().armor).toBe(initial.armor+5);expect(stats().damage).toBe(initial.damage);
 await f.service.execute({op:'preview.seek',tick:1250});expect(stats().armor).toBe(initial.armor);
 await f.service.execute({op:'preview.seek',tick:40});expect(stats().armor).toBe(initial.armor+5);
 await f.service.execute({op:'preview.reset'});expect(stats()).toEqual(initial);
});
it('previews until-death curses, source removal and manifestation through deterministic rewind/reset',async()=>{
 const f=await fixture('doom',{targetHealth:85,distance:3});
 expect(await f.service.execute({op:'preview.cast'})).toMatchObject({accepted:true});await f.service.execute({op:'preview.seek',tick:30});
 expect(f.state().duration).toBeGreaterThanOrEqual(1200);expect(f.state().duration).toBeLessThanOrEqual(12000);
 expect(f.state().entities.find(e=>e.id===f.state().target)?.spellStatuses?.[0].expires).toBe(UNTIL_DEATH);
 await f.service.execute({op:'preview.kill',subject:'caster'});await f.service.execute({op:'preview.seek',tick:170});const hash=f.state().checksum;
 expect(f.state().timelineEvents.find(e=>e.event==='statusApplied')?.endedTick).toBe(132);
 expect(f.state().entities.some(e=>e.id===f.state().caster||e.id===f.state().target)).toBe(false);
 expect(f.state().entities.find(e=>e.eligibility?.summoned)).toMatchObject({owner:'player.1'});expect(f.state().events.some(e=>e.event==='death')).toBe(true);
 await f.service.execute({op:'preview.seek',tick:20});await f.service.execute({op:'preview.seek',tick:170});expect(f.state().checksum).toBe(hash);
 await f.service.execute({op:'preview.reset'});expect(f.state().entities).toHaveLength(2);expect(f.state().entities.every(e=>!e.spellStatuses?.length&&!e.eligibility?.summoned)).toBe(true);expect(f.state().events).toEqual([]);
});
it('keeps scouting previews long enough to inspect the complete vision lifetime and replay',async()=>{
 const f=await fixture('far-sight',{targetCount:0});
 expect(await f.service.execute({op:'preview.cast'})).toMatchObject({accepted:true});
 await f.service.execute({op:'preview.seek',tick:30});
 const vision=f.state().events.find(e=>e.event==='visionCreated')!;
 expect(vision).toMatchObject({durationTicks:480,radius:8});
 expect(f.state().duration).toBeGreaterThan(vision.tick+vision.durationTicks!);
 await f.service.execute({op:'preview.seek',tick:300});const hash=f.state().checksum;
 await f.service.execute({op:'preview.seek',tick:1});await f.service.execute({op:'preview.seek',tick:300});expect(f.state().checksum).toBe(hash);
});
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
it('projects transformed attacks and ordinary arrows through the shared preview, including replay/reset',async()=>{
 const f=await fixture('metamorphosis',{combat:true,distance:8});await f.service.execute({op:'preview.cast'});
 await f.service.execute({op:'preview.seek',tick:30});
 const caster=f.state().entities.find(e=>e.id===f.state().caster)!;
 expect(caster.appearance?.asset).toBe('asset.ants.archer');expect(caster.attack?.profile).toBe('unit.ants.archer');
 await f.service.execute({op:'preview.seek',tick:46});
 expect(f.state().missiles?.some(m=>m.definition==='unit.ants.archer'&&!m.resolved)).toBe(true);
 const shots=structuredClone(f.state().missiles);await f.service.execute({op:'preview.seek',tick:2});await f.service.execute({op:'preview.seek',tick:46});expect(f.state().missiles).toEqual(shots);
 await f.service.execute({op:'preview.reset'});expect(f.state().missiles).toEqual([]);expect(f.state().entities.every(e=>!e.attack)).toBe(true);
});
it('exposes protected target eligibility and keeps targeting open after rejection',async()=>{
 const f=await fixture('storm-bolt',{initialStatuses:['ability.core.spell-ward']});
 await f.service.execute({op:'preview.beginCast'});const target=f.state().entities.find(e=>e.id!==f.state().caster)!;
 expect(target.eligibility).toMatchObject({hero:false,summoned:false,spellImmunity:'hostile'});
 const rejected=await f.service.execute({op:'preview.confirmTarget',target:{kind:'unit',entity:target.id}});
 expect(rejected).toMatchObject({accepted:false,reason:'Target is immune to this spell',state:{targeting:true,active:false,tick:0}});
});

it('exposes fixture nature without replacing models and preserves it through cast, scrub and reset',async()=>{
 const f=await fixture('death-coil',{relationship:'ally',targetNature:'undead',casterNature:'organic',targetHealth:100});
 const model=f.state().entities.find(e=>e.id===f.state().target)!.modelDefinition;
 expect(f.state().entities.find(e=>e.id===f.state().target)?.eligibility?.nature).toBe('undead');
 await f.service.execute({op:'preview.beginCast'});const id=f.state().entities.find(e=>e.id!==f.state().caster)!.id;
 expect(await f.service.execute({op:'preview.confirmTarget',target:{kind:'unit',entity:id}})).toMatchObject({accepted:true});
 await f.service.execute({op:'preview.seek',tick:80});const hash=f.state().checksum;
 expect(f.state().entities.find(e=>e.id===id)).toMatchObject({hp:300,modelDefinition:model,eligibility:{nature:'undead'}});
 await f.service.execute({op:'preview.seek',tick:4});await f.service.execute({op:'preview.seek',tick:80});expect(f.state().checksum).toBe(hash);
 await f.service.execute({op:'preview.reset'});expect(f.state().settings.targetNature).toBe('undead');expect(f.state().entities.find(e=>e.id===id)?.hp).toBe(100);
 const invalid=await fixture('death-coil',{relationship:'ally',targetNature:'organic'});
 await invalid.service.execute({op:'preview.beginCast'});const target=invalid.state().entities.find(e=>e.id!==invalid.state().caster)!;
 expect(await invalid.service.execute({op:'preview.confirmTarget',target:{kind:'unit',entity:target.id}})).toMatchObject({accepted:false,state:{targeting:true,active:false,tick:0}});
});
it('combat modifier previews activate on Cast, emit timeline events and scrub reproducibly',async()=>{
 for(const name of ['critical-strike','evasion','cleaving-attack']){
  const f=await fixture(name,{combat:true,distance:3,targetCount:3,targetSpacing:2});
  expect(f.state().entities.find(e=>e.id===f.state().caster)?.abilities?.ranks.preview).toBe(0);
  expect(await f.service.execute({op:'preview.beginCast'})).toMatchObject({accepted:true});
  await f.service.execute({op:'preview.seek',tick:350});const hash=f.state().checksum,event=name==='critical-strike'?'criticalStrike':name==='evasion'?'evaded':'cleaved';
  expect(f.state().events.some(e=>e.event===event)).toBe(true);
  await f.service.execute({op:'preview.seek',tick:30});await f.service.execute({op:'preview.seek',tick:350});expect(f.state().checksum).toBe(hash);
  await f.service.execute({op:'preview.reset'});expect(f.state().events).toEqual([]);expect(f.state().active).toBe(false);
 }
});
it('a mana-paid weapon toggle uses the selected archer and reconstructs flight, hits and reset',async()=>{
 const f=await fixture('searing-arrows',{combat:true,casterDefinition:'unit.ants.archer',distance:10,targetHealth:500});
 expect(f.state().entities.every(e=>!e.spellStatuses?.length)).toBe(true);
 expect(await f.service.execute({op:'preview.beginCast'})).toMatchObject({accepted:true});
 for(let tick=1;tick<=100&&!f.state().missiles?.some(m=>m.enhancement);tick++)await f.service.execute({op:'preview.seek',tick});
 const shot=f.state().missiles?.find(m=>m.enhancement);expect(shot).toBeDefined();
 const flightTick=shot!.launched+1;await f.service.execute({op:'preview.seek',tick:flightTick});
 expect(f.state().deliveries.some(d=>d.cast===shot!.enhancement!.cast)).toBe(true);const flying=f.state().checksum;
 await f.service.execute({op:'preview.seek',tick:100});const hash=f.state().checksum;
 expect(f.state().events.some(e=>e.event==='enhancedHit')).toBe(true);
 await f.service.execute({op:'preview.seek',tick:flightTick});expect(f.state().checksum).toBe(flying);
 await f.service.execute({op:'preview.seek',tick:100});expect(f.state().checksum).toBe(hash);
 await f.service.execute({op:'preview.reset'});expect(f.state().entities.every(e=>!e.spellStatuses?.length)).toBe(true);expect(f.state().deliveries).toEqual([]);
});
it('control prevention previews expose immunity, preserve poison damage and rewind the same ward lifetime',async()=>{
 const f=await fixture('unstoppable',{relationship:'ally',initialStatuses:['ability.core.entangling-roots'],targetHealth:500,distance:6});
 expect(f.state().entities.find(e=>e.id===f.state().target)?.eligibility?.controlImmunity).toEqual([]);
 const target=f.state().entities.find(e=>e.id!==f.state().caster)!.id;
 await f.service.execute({op:'preview.beginCast'});expect(await f.service.execute({op:'preview.confirmTarget',target:{kind:'unit',entity:target}})).toMatchObject({accepted:true});
 await f.service.execute({op:'preview.seek',tick:50});const protectedTarget=f.state().entities.find(e=>e.id===f.state().target)!;
 expect(protectedTarget.eligibility?.controlImmunity).toContain('root');expect(protectedTarget.hp).toBeLessThan(500);expect(protectedTarget.spellStatuses?.some(s=>s.ability==='ability.core.entangling-roots')).toBe(true);
 await f.service.execute({op:'preview.seek',tick:200});const hash=f.state().checksum;expect(f.state().entities.find(e=>e.id===f.state().target)?.eligibility?.controlImmunity).toEqual([]);
 await f.service.execute({op:'preview.seek',tick:20});await f.service.execute({op:'preview.seek',tick:200});expect(f.state().checksum).toBe(hash);
 await f.service.execute({op:'preview.reset'});expect(f.state().entities.find(e=>e.id===f.state().target)?.eligibility?.controlImmunity).toEqual([]);
});
it('Banish previews share ethereal damage policy, fade, expiry and deterministic scrub reset',async()=>{
 const f=await fixture('banish',{relationship:'enemy',targetHealth:500,distance:6});
 const target=f.state().entities.find(e=>e.id!==f.state().caster)!.id;
 await f.service.execute({op:'preview.beginCast'});expect(await f.service.execute({op:'preview.confirmTarget',target:{kind:'unit',entity:target}})).toMatchObject({accepted:true});
 await f.service.execute({op:'preview.seek',tick:50});const actor=f.state().entities.find(e=>e.id===target)!;
 expect(actor.eligibility?.ethereal).toBe(true);expect(actor.eligibility?.damageTakenPermille?.spell).toBe(1660);expect(actor.concealmentOpacity).toBe(.5);
 await f.service.execute({op:'preview.seek',tick:500});const hash=f.state().checksum;expect(f.state().entities.find(e=>e.id===target)?.eligibility?.ethereal).toBe(false);
 await f.service.execute({op:'preview.seek',tick:20});await f.service.execute({op:'preview.seek',tick:500});expect(f.state().checksum).toBe(hash);
 await f.service.execute({op:'preview.reset'});expect(f.state().entities.find(e=>e.id===target)?.eligibility?.ethereal).toBe(false);expect(f.state().entities.find(e=>e.id===target)?.concealmentOpacity).toBe(1);
});
it('death programs run after the preview caster is removed and replay through kill interventions',async()=>{
 const f=await fixture('death-burst',{relationship:'enemy',targetHealth:500,distance:3});
 await f.service.execute({op:'preview.beginCast'});await f.service.execute({op:'preview.kill',subject:'caster'});
 expect(f.state().entities.some(e=>e.id===f.state().caster)).toBe(false);
 await f.service.execute({op:'preview.seek',tick:10});const hash=f.state().checksum;
 expect(f.state().entities.find(e=>e.id!==f.state().caster)?.hp).toBe(420);expect(f.state().events.some(e=>e.event==='death')).toBe(true);
 await f.service.execute({op:'preview.seek',tick:2});await f.service.execute({op:'preview.seek',tick:10});expect(f.state().checksum).toBe(hash);
 await f.service.execute({op:'preview.reset'});expect(f.state().entities.some(e=>e.id===f.state().caster)).toBe(true);expect(f.state().events).toEqual([]);
});

it('previews kill passives through actual combat and reproduces rewards after rewind',async()=>{
 const f=await fixture('soul-harvest',{combat:true,distance:3,targetHealth:25});
 await f.service.execute({op:'preview.beginCast'});await f.service.execute({op:'preview.seek',tick:200});
 const events=f.state().events;expect(events.some(e=>e.event==='kill')).toBe(true);expect(events.some(e=>e.event==='healed')).toBe(true);expect(events.some(e=>e.event==='manaRestored')).toBe(true);
 const hash=f.state().checksum;await f.service.execute({op:'preview.seek',tick:1});await f.service.execute({op:'preview.seek',tick:200});expect(f.state().checksum).toBe(hash);
 await f.service.execute({op:'preview.reset'});expect(f.state().events).toEqual([]);expect(f.state().entities).toHaveLength(2);
});

it('previews paid weapon marks and source-owned death summons with deterministic scrubbing',async()=>{
 const f=await fixture('black-arrow',{combat:true,casterDefinition:'unit.ants.archer',distance:10,targetHealth:5});
 await f.service.execute({op:'preview.cast'});await f.service.execute({op:'preview.seek',tick:180});const hash=f.state().checksum;
 expect(f.state().events.some(e=>e.event==='statusApplied'&&e.statusId==='shadowMark')).toBe(true);
 expect(f.state().events.some(e=>e.event==='death')).toBe(true);expect(f.state().entities.some(e=>e.eligibility?.summoned)).toBe(true);
 await f.service.execute({op:'preview.seek',tick:5});await f.service.execute({op:'preview.seek',tick:180});expect(f.state().checksum).toBe(hash);
 await f.service.execute({op:'preview.reset'});expect(f.state().entities.every(e=>!e.spellStatuses?.length&&!e.eligibility?.summoned)).toBe(true);
});

it('rank selection controls summoned definitions and the timeline lifetime through rewind',async()=>{
 const f=await fixture('feral-spirit',{relationship:'self'}),op=f.document.definition.onRelease[0];if(op.op!=='summon')throw Error();
 f.document.definition.ranks=[{duration:80},{duration:160}];f.document.definition.cast.cost.amount=0;f.document.definition.cast.cooldown.ticks=0;
 op.amount=1;op.durationTicks={rankParameter:'duration'};op.definition={byRank:['unit.spell.shadow-spirit-lesser','unit.spell.shadow-spirit-greater']};
 await f.service.execute({op:'preview.load',document:f.document,settings:f.state().settings});
 await f.service.execute({op:'preview.rank',rank:2});await f.service.execute({op:'preview.cast'});await f.service.execute({op:'preview.seek',tick:40});
 expect(f.state().entities.find(e=>e.eligibility?.summoned)).toMatchObject({definition:'unit.spell.shadow-spirit-greater',maxHp:405});
 expect(f.state().events.find(e=>e.event==='summoned')).toMatchObject({durationTicks:160});
 const hash=f.state().checksum;await f.service.execute({op:'preview.seek',tick:1});await f.service.execute({op:'preview.seek',tick:40});expect(f.state().checksum).toBe(hash);
 await f.service.execute({op:'preview.seek',tick:180});expect(f.state().entities.some(e=>e.eligibility?.summoned)).toBe(false);
 await f.service.execute({op:'preview.rank',rank:1});await f.service.execute({op:'preview.cast'});await f.service.execute({op:'preview.seek',tick:40});
 expect(f.state().entities.find(e=>e.eligibility?.summoned)).toMatchObject({definition:'unit.spell.shadow-spirit-lesser',maxHp:215});
});

it('previews sacrifice and resource rewards with independent fixture pools and repeatable casts',async()=>{
 for(const name of ['death-pact','dark-ritual']){
  const f=await fixture(name,{relationship:'ally',casterHealth:100,mana:100,targetHealth:80});
  for(let n=0;n<3;n++){
   await f.service.execute({op:'preview.cast'});await f.service.execute({op:'preview.seek',tick:40});
   const caster=f.state().entities.find(e=>e.id===f.state().caster)!;
   expect(f.state().entities).toHaveLength(1);expect(f.state().events.some(e=>e.event==='sacrificed')).toBe(true);
   expect(name==='death-pact'?caster.hp:caster.abilities?.mana).toBe(name==='death-pact'?500:265);
   const checksum=f.state().checksum;await f.service.execute({op:'preview.seek',tick:1});await f.service.execute({op:'preview.seek',tick:40});expect(f.state().checksum).toBe(checksum);
  }
  await f.service.execute({op:'preview.reset'});expect(f.state().entities).toHaveLength(2);expect(f.state().entities.find(e=>e.id===f.state().caster)).toMatchObject({hp:100,abilities:{mana:100}});
 }
});
it('previews percentage channel damage with interrupted waves and deterministic rewind',async()=>{
 const f=await fixture('death-and-decay',{targetHealth:500,targetCount:3,distance:8});
 await f.service.execute({op:'preview.cast'});await f.service.execute({op:'preview.seek',tick:100});
 expect(f.state().entities.filter(e=>e.id!==f.state().caster).every(e=>e.hp===460)).toBe(true);
 await f.service.execute({op:'preview.stop'});await f.service.execute({op:'preview.seek',tick:160});
 expect(f.state().entities.filter(e=>e.id!==f.state().caster).every(e=>e.hp===460)).toBe(true);
 const checksum=f.state().checksum;await f.service.execute({op:'preview.seek',tick:1});await f.service.execute({op:'preview.seek',tick:160});expect(f.state().checksum).toBe(checksum);
});
it('keeps a post-expiry inspection window for persistent effects with zero recovery',async()=>{
 const f=await fixture('flame-strike');f.document.definition.cast.recoverTicks=0;
 f.document.definition.persistent!.durationTicks=240;f.document.definition.persistent!.intervalTicks=40;
 await f.service.execute({op:'preview.load',document:f.document,settings:{relationship:'enemy',targetHealth:500}});
 await f.service.execute({op:'preview.cast'});await f.service.execute({op:'preview.seek',tick:400});
 const state=f.state(),start=state.events.find(e=>e.event==='released')!,end=state.events.find(e=>e.event==='finished'&&e.reason==='Expired')!;
 expect(end.tick-start.tick).toBe(240);expect(state.tick).toBeGreaterThan(end.tick+40);
 expect(state.events.filter(e=>e.event==='damaged').every(e=>e.tick<end.tick)).toBe(true);
});

it('moves a newly revived entity without retargeting/reset, reproduces that intervention on seek and rejects expired IDs',async()=>{
 const f=await fixture('animate-dead',{fallenTargets:true,targetCount:3,distance:4});
 await f.service.execute({op:'preview.cast'});await f.service.execute({op:'preview.seek',tick:40});
 const before=f.state(),raised=before.entities.find(e=>e.eligibility?.summoned)!;expect(raised).toBeDefined();
 const caster=before.entities.find(e=>e.id===before.caster)!;
 await f.service.execute({op:'preview.displace',entity:raised.id,distance:9});
 expect(f.state()).toMatchObject({tick:40,target:before.target,active:true});
 expect(f.state().entities.find(e=>e.id===raised.id)).toMatchObject({x:caster.x+9,y:caster.y,hp:raised.hp});
 expect(f.state().entities.filter(e=>e.id!==raised.id)).toEqual(before.entities.filter(e=>e.id!==raised.id));
 await f.service.execute({op:'preview.seek',tick:45});const moved=f.state();
 await f.service.execute({op:'preview.seek',tick:0});await f.service.execute({op:'preview.seek',tick:45});expect(f.state().checksum).toBe(moved.checksum);
 await f.service.execute({op:'preview.seek',tick:1650});const expired=f.state();
 await expect(f.service.execute({op:'preview.displace',entity:raised.id,distance:9})).rejects.toThrow('living caster and subject');expect(f.state().checksum).toBe(expired.checksum);
 await f.service.execute({op:'preview.seek',tick:45});expect(f.state().checksum).toBe(moved.checksum);
});

it('toggles the live published flight form off without resetting and replays landing across the intervention',async()=>{
 const f=await fixture('flight-form');
 await expect(f.service.execute({op:'preview.toggleOff'})).rejects.toThrow('No active toggle');
 await f.service.execute({op:'preview.cast'});await f.service.execute({op:'preview.seek',tick:60});
 const before=f.state(),caster=before.entities.find(e=>e.id===before.caster)!;
 expect(before.toggleActive).toBe(true);expect(caster.elevation).toBe(7);expect(caster.spellStatuses?.some(s=>s.status==='soaring')).toBe(true);
 expect(await f.service.execute({op:'preview.toggleOff'})).toMatchObject({accepted:true});
 expect(f.state().tick).toBe(60);expect(f.state().epoch).toBe(before.epoch);expect(f.state().toggleActive).toBe(false);
 expect(f.state().events.at(-1)).toMatchObject({event:'finished',reason:'Toggled off',tick:60});
 await f.service.execute({op:'preview.seek',tick:80});const landed=f.state();
 const ant=landed.entities.find(e=>e.id===landed.caster)!;expect(ant.elevation).toBe(0);expect(ant.spellStatuses).toBeUndefined();expect(ant.appearance).toBeUndefined();
 await expect(f.service.execute({op:'preview.toggleOff'})).rejects.toThrow('No active toggle');
 await f.service.execute({op:'preview.seek',tick:59});expect(f.state().toggleActive).toBe(true);
 await f.service.execute({op:'preview.seek',tick:80});expect(f.state().checksum).toBe(landed.checksum);
 await f.service.execute({op:'preview.cast'});await f.service.execute({op:'preview.seek',tick:80});expect(f.state().toggleActive).toBe(true);
});
