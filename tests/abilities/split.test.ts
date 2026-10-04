import {expect,it,vi} from 'vitest';
import {abilitySchema,type AbilityDefinition} from '../../src/content/abilities/schema';
import {coreAbilities} from '../../src/content/abilities/core';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {SpellSplitForms} from '../../src/sim/abilities/splitForms';
import {SpellContainments} from '../../src/sim/abilities/containment';
import {UnitOwnership} from '../../src/sim/game/ownership';
import {colonySupply} from '../../src/sim/game/supply';
const base=coreAbilities.abilities.find(a=>a.id==='ability.core.feral-spirit')!,p=coreAbilities.presentations.find(p=>p.id===base.presentation)!;
const split={op:'split',id:'bodies',target:'caster',amount:80,members:['unit.spell.shadow-spirit-greater','unit.spell.shadow-spirit-standard','unit.spell.shadow-spirit-lesser'],radius:3,returnHealthPermille:1000,returnManaPermille:1000};
function fixture(op:Record<string,unknown>={},settings:Record<string,unknown>={},extra:Partial<AbilityDefinition>={}){
 const a=abilitySchema.parse({...base,cast:{...base.cast,prepareTicks:0,recoverTicks:0,cost:{...base.cast.cost,amount:15},cooldown:{...base.cast.cooldown,ticks:200}},onRelease:[{...split,...op}],...extra});
 const f=createAbilityEncounter(a,p,encounterSettingsSchema.parse({relationship:'enemy',targetCount:1,targetHealth:500,distance:10,mana:1000,...settings}));
 return {...f,a,c:()=>f.game.context.get(f.caster)!,members:()=>f.game.entities.filter(e=>e.summoned?.source===f.caster)};
}
type Fixture=ReturnType<typeof fixture>;
function tick(f:Fixture,n=1){for(let i=0;i<n;i++)f.game.tick(undefined,{passiveUnits:true});}
function cast(f:Fixture){const result=f.game.command('player.1',{type:'castAbility',actor:f.caster,binding:'preview',target:{kind:'unit',entity:f.caster}});expect(result.accepted,JSON.stringify(result)).toBe(true);tick(f);expect(f.c().spellSplit).toBeTruthy();}
function kill(f:Fixture,id:number){const e=f.game.context.get(id)!;e.hp=0;f.game.onCombatDeath(e);}
it('creates an ordered group atomically, retains the original identity and restores at the first survivor',()=>{
 const f=fixture();f.c().hp=120;const id=f.c().id;cast(f);expect(f.members()).toHaveLength(3);expect(f.c().unit!.contained).toBe(f.members()[0].id);expect(f.c().abilities!.mana).toBe(985);
 f.game.restore(f.game.snapshot());const first=f.members()[0];first.x=130;first.y=130;tick(f);expect(f.c()).toMatchObject({x:130,y:130});
 tick(f,80);expect(f.members()).toHaveLength(0);expect(f.c().id).toBe(id);expect(f.c().spellSplit).toBeUndefined();expect(f.c().unit!.contained).toBeNull();expect(f.c().hp).toBe(500);expect(f.c().abilities!.mana).toBe(1000);expect(Math.hypot(f.c().x-130,f.c().y-130)).toBeLessThan(4);f.game.restore(f.game.snapshot());
 expect(f.game.abilities.observedEvents().filter(e=>e.event==='splitStarted')).toHaveLength(0); // Restore discards transient history.
});
it('rejects blocked placement before mana, cooldown or entities are committed',()=>{
 const f=fixture();const count=f.game.entities.length,before=structuredClone(f.c().abilities);const block=vi.spyOn(f.game.spatial,'nearest').mockReturnValue(null);
 const r=f.game.command('player.1',{type:'castAbility',actor:f.caster,binding:'preview',target:{kind:'unit',entity:f.caster}});expect(r.accepted).toBe(false);expect(f.game.entities).toHaveLength(count);expect(f.c().abilities).toEqual(before);block.mockRestore();
});
it('rechecks placement at release, never creating half a group',()=>{
 const f=fixture({}, {},{cast:{...base.cast,prepareTicks:4,recoverTicks:0,cost:{...base.cast.cost,amount:15},cooldown:{...base.cast.cooldown,ticks:200}}});
 expect(f.game.command('player.1',{type:'castAbility',actor:f.caster,binding:'preview',target:{kind:'unit',entity:f.caster}}).accepted).toBe(true);const block=vi.spyOn(f.game.spatial,'nearest').mockReturnValue(null);tick(f,8);expect(f.members()).toHaveLength(0);expect(f.c().abilities!.mana).toBe(1000);expect(f.c().spellSplit).toBeUndefined();block.mockRestore();
});
it('survivor priority switches immediately when the anchor dies, and can save before another tick',()=>{
 const f=fixture();cast(f);const ids=f.members().map(e=>e.id);kill(f,ids[0]);expect(f.c().unit!.contained).toBe(ids[1]);f.game.restore(f.game.snapshot());kill(f,ids[1]);expect(f.c().unit!.contained).toBe(ids[2]);f.game.restore(f.game.snapshot());tick(f,80);expect(f.c()).toBeTruthy();
});
it('loss of every body kills the retained hero through the normal fallen-hero path',()=>{
 const f=fixture({}, {casterHero:true});cast(f);for(const id of f.members().map(e=>e.id))kill(f,id);expect(f.c().fallen).toBeTruthy();expect(f.c().hp).toBe(0);expect(f.c().spellSplit).toBeUndefined();f.game.restore(f.game.snapshot());
});
it('authored return-on-loss reforms without inventing a death or revival',()=>{
 const f=fixture({onAllLost:'return'});cast(f);for(const id of f.members().map(e=>e.id))kill(f,id);expect(f.c().hp).toBe(500);expect(f.c().unit!.contained).toBeNull();expect(f.c().spellSplit).toBeUndefined();f.game.restore(f.game.snapshot());
});
it('removing the source cleans up members without recursive death bursts',()=>{
 const f=fixture();cast(f);const ids=f.members().map(e=>e.id);f.game.economy.remove(f.c());expect(ids.every(id=>!f.game.context.get(id))).toBe(true);expect(f.game.context.get(f.caster)).toBeUndefined();f.game.restore(f.game.snapshot());
});
it('linked members cannot be converted or swallowed while retaining another actor',()=>{
 const f=fixture();cast(f);const member=f.members()[0],enemy=f.game.context.get(f.target)!;expect(new UnitOwnership(f.game).reason(member,'player.2','allow-over-cap')).toBeTruthy();expect(new SpellContainments(f.game).reason(enemy,member,1)).toBeTruthy();
});
it('temporary bodies consume unit capacity, while original supply remains counted exactly once',()=>{
 const f=fixture();const before=colonySupply(f.game.entities,'player.1',f.game.registry);cast(f);const during=colonySupply(f.game.entities,'player.1',f.game.registry);expect(during.used).toBe(before.used);expect(during.units).toBe(before.units+3);tick(f,80);expect(colonySupply(f.game.entities,'player.1',f.game.registry).units).toBe(before.units);
});
it('preserves current pools when no return fractions are authored',()=>{
 const f=fixture({returnHealthPermille:undefined,returnManaPermille:undefined});f.c().hp=123;cast(f);tick(f,80);expect(f.c().hp).toBe(123);expect(f.c().abilities!.mana).toBe(985);
});
it('rejects corrupted clocks, member provenance, host and slot order atomically',()=>{
 const f=fixture();cast(f);const hash=f.game.checksum();
 for(const change of [(s:any)=>s.expires++,(s:any)=>s.started++,(s:any)=>s.cast++,(s:any)=>s.members.reverse(),(s:any)=>s.members[0]=99999,(s:any)=>s.members[0]=s.members[1],(s:any)=>s.owner='player.2']){const save=f.game.snapshot();change(save.state.entities.find(e=>e.id===f.caster)!.spellSplit);expect(()=>f.game.restore(save)).toThrow();expect(f.game.checksum()).toBe(hash);}
 const save=f.game.snapshot();delete save.state.entities.find(e=>e.id===f.members()[0].id)!.summoned!.splitOperation;expect(()=>f.game.restore(save)).toThrow();expect(f.game.checksum()).toBe(hash);
});
it('matches every checksum across JSON restore, anchor loss and reformation',()=>{
 const f=fixture(),g=fixture();cast(f);g.game.restore(JSON.parse(JSON.stringify(f.game.snapshot())));
 for(let i=0;i<100;i++){if(i===20){kill(f,f.members()[0].id);kill(g,g.members()[0].id);}tick(f);tick(g);if(i%13===0)g.game.restore(JSON.parse(JSON.stringify(f.game.snapshot())));expect(g.game.checksum(),`tick ${i}`).toBe(f.game.checksum());}
});
it('validates bounded, ranked, direct self transformations',()=>{
 for(const op of [{members:[]},{amount:0},{amount:144001},{returnHealthPermille:0},{returnManaPermille:1001},{members:[{byRank:['unit.spell.feral-spirit','unit.spell.feral-spirit']},'unit.spell.feral-spirit']}])expect(()=>fixture(op)).toThrow();
 expect(()=>fixture({}, {},{targeting:{...base.targeting,kind:'unit'}})).toThrow();expect(()=>fixture({}, {},{onRelease:[split as any,{op:'heal',target:'caster',amount:1}]})).toThrow();
});
it('accepts ordinary member orders while refusing commands to the retained caster',()=>{
 const f=fixture();cast(f);const member=f.members()[0];
 expect(f.game.command('player.1',{type:'move',actors:[f.caster],destination:{x:140,y:130}}).accepted).toBe(false);
 expect(f.game.command('player.1',{type:'move',actors:[member.id],destination:{x:140,y:130}}).accepted).toBe(true);
 tick(f,8);expect(f.members()[0].unit!.order).toBeTruthy();
});
it('uses real delayed multiplayer commits through a mid-form World restore',async()=>{
 const {Room,Lockstep,MemoryChannel}=await import('../../src/net');const {World}=await import('../../src/sim/world/world');const {localMatch}=await import('../../src/shared');
 const f=fixture(),opts={map:f.game.map,slots:f.game.slots,registry:f.game.registry,seed:23};
 const worlds=[new World(opts),new World(opts)],config={...localMatch({mapId:'split-proof',mapRevision:'test',seed:23,slotCount:2,me:0,delay:3}),slots:[...f.game.slots]};
 const room=new Room(config),channels=[new MemoryChannel(room,0),new MemoryChannel(room,1)],peers=channels.map((c,i)=>new Lockstep(c,i,3));
 peers[0].send({type:'castAbility',actor:f.caster,binding:'preview',target:{kind:'unit',entity:f.caster}});
 let entered=false,returned=false;try{for(let tick=1;tick<=110;tick++){
  peers[tick%2].confirm(tick);peers[1-tick%2].confirm(tick);
  for(let i=0;i<2;i++){const commit=peers[i].take(tick)!;expect(commit).toBeTruthy();for(const slot of commit.slots)slot.actions.forEach((action,seq)=>worlds[i].enqueue(action,commit.tick,{player:slot.player,seq}));worlds[i].tick();}
  entered ||= !!worlds[0].settlement.context.get(f.caster)?.spellSplit;returned ||= worlds[0].settlement.abilities.observedEvents().some(e=>e.event==='splitEnded');
  if(tick===30){const snapshot=JSON.parse(JSON.stringify(worlds[1].snapshot()));worlds[1]=new World(opts);worlds[1].restore(snapshot);}
  expect(worlds[1].checksum(),`lockstep tick ${tick}`).toBe(worlds[0].checksum());
 }expect(entered).toBe(true);expect(returned).toBe(true);}finally{channels.forEach(c=>c.destroy());}
});
it('waits safely for a blocked return location, then rejoins the world',()=>{
 const f=fixture();cast(f);const blocked=vi.spyOn(f.game.spatial,'nearest').mockReturnValue(null);tick(f,80);expect(f.c().spellSplit).toBeUndefined();expect(f.c().unit!.contained).toBeNull();expect(f.c().unit!.release).toBeTruthy();f.game.restore(f.game.snapshot());blocked.mockRestore();tick(f);expect(f.c().unit!.release).toBeNull();
});
it('keeps a real hero inventory, progression and learned ranks on the original actor',()=>{
 const f=fixture();const hero=f.game.context.create({id:'hero',definition:'unit.ants.marshal',owner:'player.1',position:{x:145,y:145},rotation:0});
 const before=structuredClone({equipment:hero.equipment,progression:hero.progression,ranks:hero.abilities?.ranks});const op=f.a.onRelease[0];expect(op.op).toBe('split');if(op.op!=='split')throw Error('fixture');
 expect(new SpellSplitForms(f.game).enter(hero,f.a,1,f.game.state.nextCast++,op)).toBe(3);const ids=hero.spellSplit!.members;
 expect(ids.map(id=>f.game.context.get(id)!.equipment)).toEqual([undefined,undefined,undefined]);f.game.restore(f.game.snapshot());tick(f,81);const returned=f.game.context.get(hero.id)!;
 expect({equipment:returned.equipment,progression:returned.progression,ranks:returned.abilities?.ranks}).toEqual(before);f.game.restore(f.game.snapshot());
});
it('repeated workbench casts and rewinds reproduce the group, return and finite timeline',async()=>{
 const {SpellEditorService}=await import('../../tooling/spell-editor/server/service');
 const base=coreAbilities.abilities.find(a=>a.id==='ability.core.spirit-trinity')!,presentation=coreAbilities.presentations.find(p=>p.id===base.presentation)!;
 const s=new SpellEditorService(process.cwd());await s.execute({op:'preview.load',document:{definition:base,presentation},settings:{relationship:'self'}});
 let hash:number|undefined;for(let attempt=0;attempt<3;attempt++){
  await s.execute({op:'preview.cast'});await s.execute({op:'preview.seek',tick:60});const state=s.state() as any;expect(state.entities).toHaveLength(3);expect(state.entities.every((e:any)=>e.definition.startsWith('unit.spell.trinity-'))).toBe(true);if(hash===undefined)hash=state.checksum;else expect(state.checksum).toBe(hash);
  await s.execute({op:'preview.seek',tick:2420});const ended=s.state() as any;expect(ended.entities).toHaveLength(1);expect(ended.entities[0].id).toBe(ended.caster);expect(ended.timelineEvents.find((e:any)=>e.event==='splitStarted').endedTick).toBe(2410);
 }
});
