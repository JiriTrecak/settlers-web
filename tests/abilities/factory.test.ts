import {expect,it} from 'vitest';
import {coreAbilities} from '../../src/content/abilities/core';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {SpellEditorService} from '../../tooling/spell-editor/server/service';
import type {PreviewState} from '../../tooling/spell-editor/shared/view';
const a=coreAbilities.abilities.find(a=>a.id==='ability.core.grove-nursery')!,p=coreAbilities.presentations.find(p=>p.id===a.presentation)!;
const fixture=()=>createAbilityEncounter(a,p,encounterSettingsSchema.parse({relationship:'enemy',targetHealth:500,distance:10,mana:1000}));
const step=(f:ReturnType<typeof fixture>,n=1)=>{for(let i=0;i<n;i++)f.game.tick(undefined,{passiveUnits:true});};
const nursery=(f:ReturnType<typeof fixture>)=>f.game.entities.find(e=>e.definition==='unit.spell.grove-nursery')!;
const children=(f:ReturnType<typeof fixture>)=>f.game.entities.filter(e=>e.definition==='unit.spell.feral-spirit');
function cast(f:ReturnType<typeof fixture>,rank=1,position={x:128,y:122}){const c=f.game.context.get(f.caster)!;c.abilities!.ranks.preview=rank;c.abilities!.mana=1000;c.abilities!.cooldowns={};expect(f.game.command('player.1',{type:'castAbility',actor:c.id,binding:'preview',target:{kind:'point',position}}).accepted).toBe(true);step(f,11);}
it.each([1,2,3])('published rank %i produces at its declared interval, caps children and retains its captured rank',rank=>{
 const f=fixture();cast(f,rank);const factory=nursery(f),period=[200,160,120][rank-1];expect(factory).toBeTruthy();expect(f.game.context.def(factory).behaviors.movement).toBeUndefined();expect(factory.spellStatuses?.map(s=>s.status)).toEqual(['producing']);
 step(f,period-1);expect(children(f)).toHaveLength(0);step(f);expect(children(f)).toHaveLength(1);expect(children(f)[0].summoned).toMatchObject({source:factory.id,rank,sourceLink:{owner:'player.1'}});
 f.game.context.get(f.caster)!.abilities!.ranks.preview=1;
 step(f,period*5);expect(children(f)).toHaveLength(6);expect(children(f).every(e=>e.summoned!.rank===rank&&e.spellStatuses?.[0].status==='volatile')).toBe(true);f.game.restore(f.game.snapshot());
});
it('survives the original summoner but child lifetime is tied to the nursery',()=>{
 const f=fixture();cast(f);step(f,210);const factory=nursery(f),caster=f.game.context.get(f.caster)!;caster.hp=0;f.game.onCombatDeath(caster);step(f,200);expect(nursery(f)).toBe(factory);expect(children(f)).toHaveLength(2);
 factory.hp=0;f.game.onCombatDeath(factory);step(f);expect(children(f)).toHaveLength(0);expect(nursery(f)).toBeUndefined();expect(f.game.state.corpses.some(c=>c.definition.startsWith('unit.spell.'))).toBe(false);
});
it('child death executes its ranked area burst and nursery expiry clears the whole dependency group',()=>{
 const f=fixture();cast(f,3);step(f,120);const child=children(f)[0],target=f.game.context.get(f.target)!;target.x=child.x+1;target.y=child.y;target.unit!.position=null;
 const before=target.hp!;child.hp=0;f.game.onCombatDeath(child);step(f);expect(target.hp).toBe(before-80);expect(f.game.abilities.observedEvents().some(e=>e.event==='death'&&e.caster===child.id)).toBe(true);
 step(f,1500);expect(nursery(f)).toBeUndefined();expect(children(f)).toHaveLength(0);f.game.context.get(f.caster)!.abilities!.ranks.preview=1;f.game.restore(f.game.snapshot());
});
it('replays command-created factories, timers, child bursts and replacement identically after restore',()=>{
 const f=fixture(),g=fixture();cast(f);g.game.restore(f.game.snapshot());
 for(let i=0;i<450;i++){step(f);step(g);expect(g.game.checksum()).toBe(f.game.checksum());if(i===150||i===170)g.game.restore(f.game.snapshot());}
 const old=nursery(f).id;cast(f,1,{x:120,y:114});cast(g,1,{x:120,y:114});step(f,20);step(g,20);expect(g.game.checksum()).toBe(f.game.checksum());expect(nursery(f).id).not.toBe(old);expect(children(f)).toHaveLength(0);
});
it('the independent workbench renders the timer-driven timeline and repeatedly rewinds the shared simulation',async()=>{
 const s=new SpellEditorService(process.cwd());await s.execute({op:'preview.load',document:{definition:a,presentation:p},settings:{relationship:'enemy',targetHealth:500,distance:10}});
 for(let i=0;i<3;i++){await s.execute({op:'preview.aim',position:{x:128,y:122}});await s.execute({op:'preview.cast'});await s.execute({op:'preview.seek',tick:430});const state=s.state() as PreviewState;
 expect(state.events.filter(e=>e.event==='interval')).toHaveLength(2);expect(state.entities.filter(e=>e.eligibility?.summoned)).toHaveLength(3);expect(state.effects?.some(e=>e.id==='effect.core.grove-nursery.pulse')).toBe(true);
 const hash=state.checksum;await s.execute({op:'preview.seek',tick:1});await s.execute({op:'preview.seek',tick:430});expect((s.state() as PreviewState).checksum).toBe(hash);}
});
it('runs through delayed lockstep commits and a World restore while children fight normally',async()=>{
 const {Room,Lockstep,MemoryChannel}=await import('../../src/net');const {World}=await import('../../src/sim/world/world');const {localMatch}=await import('../../src/shared');
 const f=fixture(),opts={map:f.game.map,slots:f.game.slots,registry:f.game.registry,seed:23};
 const worlds=[new World(opts),new World(opts)],config={...localMatch({mapId:'factory-proof',mapRevision:'test',seed:23,slotCount:2,me:0,delay:3}),slots:[...f.game.slots]};
 const room=new Room(config),channels=[new MemoryChannel(room,0),new MemoryChannel(room,1)],peers=channels.map((c,i)=>new Lockstep(c,i,3));
 peers[0].send({type:'castAbility',actor:f.caster,binding:'preview',target:{kind:'point',position:{x:128,y:122}}});
 let produced=false,fought=false;const initialHp=worlds[0].settlement.context.get(f.target)!.hp!;
 try{for(let tick=1;tick<=520;tick++){
  peers[tick%2].confirm(tick);peers[1-tick%2].confirm(tick);
  for(let i=0;i<2;i++){const commit=peers[i].take(tick)!;expect(commit).toBeTruthy();for(const slot of commit.slots)slot.actions.forEach((action,seq)=>worlds[i].enqueue(action,commit.tick,{player:slot.player,seq}));worlds[i].tick();}
  produced ||= worlds[0].settlement.entities.some(e=>e.definition==='unit.spell.feral-spirit');fought ||= (worlds[0].settlement.context.get(f.target)?.hp??0)<initialHp;
  if(tick===250){const snapshot=JSON.parse(JSON.stringify(worlds[1].snapshot()));worlds[1]=new World(opts);worlds[1].restore(snapshot);}
  expect(worlds[1].checksum(),`lockstep tick ${tick}`).toBe(worlds[0].checksum());
 }expect(produced).toBe(true);expect(fought).toBe(true);}finally{channels.forEach(c=>c.destroy());}
});
