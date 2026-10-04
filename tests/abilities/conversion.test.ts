import {Game} from '../../src/sim/game/game';
import {content} from '../../src/content/builtin';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {placed,slots} from '../game/helpers';
import {expect,it,vi} from 'vitest';
import {abilitySchema,resolveEffect,type Effect} from '../../src/content/abilities/schema';
import {coreAbilities} from '../../src/content/abilities/core';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {colonySupply} from '../../src/sim/game/supply';
import {UnitOwnership} from '../../src/sim/game/ownership';
import {SpellSummons} from '../../src/sim/abilities/summons';
import {SpellStatuses} from '../../src/sim/abilities/statuses';
import {SpellEditorService} from '../../tooling/spell-editor/server/service';
import type {PreviewState} from '../../tooling/spell-editor/shared/view';
import {abilityAimScore} from '../../src/sim/abilities/ai';
const base=coreAbilities.abilities.find(a=>a.id==='ability.core.holy-light')!;
const presentation=coreAbilities.presentations.find(p=>p.id===base.presentation)!;
const convert:Extract<Effect,{op:'convert'}>={op:'convert',target:'target',amount:1,supply:'allow-over-cap'};
function definition(patch={},op=convert){return abilitySchema.parse({...base,ranks:[base.ranks[0]],targeting:{...base.targeting,relations:['enemy'],filter:{heroes:false,natures:['organic','undead']},condition:{kind:'any',conditions:[{kind:'controller',of:'target',is:'player'},{kind:'matches',of:'target',filter:{maxLevel:5}}]}},cast:{...base.cast,prepareTicks:2,recoverTicks:1},onRelease:[op],...patch});}
function fixture(settings={},patch={},op=convert){const a=definition(patch,op),f=createAbilityEncounter(a,presentation,encounterSettingsSchema.parse({relationship:'enemy',targetCount:1,targetHealth:300,mana:1000,...settings}));return {...f,a,c:f.game.context.get(f.caster)!,t:f.game.context.get(f.target)!};}
const step=(f:ReturnType<typeof fixture>,n=1)=>{for(let i=0;i<n;i++)f.game.tick(undefined,{passiveUnits:true});};
const cast=(f:ReturnType<typeof fixture>)=>f.game.abilities.cast(f.caster,'preview',f.target);
it('permanently transfers the existing unit, preserves pools and clears old orders',()=>{
 const f=fixture(),id=f.t.id,position={x:f.t.x,y:f.t.y};f.t.unit!.order={type:'move',destination:{x:150,y:140},attackMove:false};f.t.unit!.orderQueue=[f.t.unit!.order];f.t.unit!.cooldown=80;
 expect(cast(f)).toBeNull();step(f,5);
 expect(f.game.context.get(id)).toBe(f.t);expect(f.t.owner).toBe('player.1');expect(f.t.hp).toBe(300);expect({x:f.t.x,y:f.t.y}).toEqual(position);expect(f.t.unit!.order).toBeNull();expect(f.t.unit!.orderQueue).toEqual([]);expect(f.t.unit!.cooldown).toBe(80);
 expect(colonySupply(f.game.entities,'player.1',f.game.registry).units).toBe(2);expect(colonySupply(f.game.entities,'player.2',f.game.registry).units).toBe(0);expect(f.game.abilities.observedEvents().some(e=>e.event==='converted'&&e.target===id)).toBe(true);
 f.c.hp=0;f.game.onCombatDeath(f.c);step(f,5);expect(f.t.owner).toBe('player.1');f.game.restore(f.game.snapshot());
});
it('detaches hostile neutral camp membership without killing or paying camp loot',()=>{
 const f=fixture({relationship:'neutral',combat:true});const stats=f.game.context.stats.bind(f.game.context);vi.spyOn(f.game.context,'stats').mockImplementation(e=>({...stats(e),level:1}));expect(f.t.unit!.camp).toBe('preview-camp');expect(cast(f)).toBeNull();step(f,5);expect(f.t.owner).toBe('player.1');expect(f.t.unit!.camp).toBeNull();expect(f.game.state.clearedCamps).toEqual([]);expect(f.game.state.corpses).toEqual([]);expect(f.game.command('player.1',{type:'move',actors:[f.t.id],destination:{x:130,y:125}}).accepted).toBe(true);f.game.restore(f.game.snapshot());
});
it('uses a declarative neutral-only level limit while admitting high-level player units',()=>{
 const neutral=fixture({relationship:'neutral',combat:true}),player=fixture();
 for(const f of [neutral,player]){const stats=f.game.context.stats.bind(f.game.context);vi.spyOn(f.game.context,'stats').mockImplementation(e=>({...stats(e),level:e.id===f.target?6:1}));}
 expect(cast(neutral)).toMatch(/filters/);expect(cast(player)).toBeNull();step(player,5);expect(player.t.owner).toBe('player.1');
});
it('rejects heroes, mechanical units, hidden or unavailable targets and spell immunity',()=>{
 for(const settings of [{targetHero:true},{targetNature:'mechanical' as const},{initialStatuses:['ability.core.spell-ward']}]){const f=fixture(settings);expect(cast(f)).not.toBeNull();expect(f.t.owner).toBe('player.2');}
 const hidden=fixture({distance:30});expect(cast(hidden)).not.toBeNull();
 const busy=fixture();busy.t.unit!.contained=busy.caster;expect(cast(busy)).not.toBeNull();
 const own=fixture({relationship:'ally'});expect(cast(own)).not.toBeNull();
});
it('checks capacity before cost and again at release, with an explicit supply-cap bypass',()=>{
 const require=fixture({}, {},{...convert,supply:'require'});expect(cast(require)).toMatch(/supply/i);expect(require.c.abilities!.mana).toBe(1000);
 const f=fixture();expect(cast(f)).toBeNull();const population=f.game.context.populationCandidates();vi.spyOn(f.game.context,'populationCandidates').mockReturnValue([...population,...Array.from({length:f.game.registry.rules.maxUnits},(_,i)=>({...f.c,id:10000+i}))]);step(f,5);expect(f.t.owner).toBe('player.2');expect(f.c.abilities!.mana).toBe(1000);
});
it('cancels the captured caster and refunds preparation while keeping learned ranks and cooldowns',()=>{
 const f=fixture();expect(cast(f)).toBeNull();const ranks=structuredClone(f.c.abilities!.ranks);f.c.abilities!.cooldowns['ability.core.holy-light']=200;
 expect(new UnitOwnership(f.game).transfer(f.c,'player.2','allow-over-cap')).toBe(true);expect(f.c.abilities!.pending).toBeNull();expect(f.c.abilities!.mana).toBe(1000);expect(f.c.abilities!.ranks).toEqual(ranks);expect(f.c.abilities!.cooldowns['ability.core.holy-light']).toBe(200);f.game.restore(f.game.snapshot());step(f,10);expect(f.t.owner).toBe('player.2');
});
it('keeps timed statuses but removes old aura membership',()=>{
 const f=fixture(),s=new SpellStatuses(f.game),slow=coreAbilities.abilities.find(a=>a.id==='ability.core.frost-armor')!,effect=slow.onRelease.find(e=>e.op==='status') as Extract<Effect,{op:'status'}>;
 s.apply(f.caster,f.target,slow,1,f.game.state.nextCast++,resolveEffect(effect,1,slow.ranks[0]));const status=structuredClone(f.t.spellStatuses);expect(status?.length).toBeGreaterThan(0);
 f.t.spellStatuses!.push({...f.t.spellStatuses![0],aura:true});expect(new UnitOwnership(f.game).transfer(f.t,'player.1','allow-over-cap')).toBe(true);expect(f.t.spellStatuses).toEqual(status);
});
it('does not erase captured summons when their original summoner replaces a group',()=>{
 const f=fixture(),a=coreAbilities.abilities.find(a=>a.id==='ability.core.feral-spirit')!,op=resolveEffect(a.onRelease.find(e=>e.op==='summon') as Extract<Effect,{op:'summon'}>,1,a.ranks[0]);if(op.op!=='summon')throw Error('summon');const summons=new SpellSummons(f.game),source={id:f.caster,owner:'player.1' as const,rotation:0};
 const first=summons.groupsAt(source,a,1,f.game.state.nextCast++,op,{x:125,y:125}),captured=f.game.context.get(first[0].units[0].id)!;const expires=captured.summoned!.expires;
 expect(new UnitOwnership(f.game).transfer(captured,'player.2','allow-over-cap')).toBe(true);summons.groupsAt(source,a,1,f.game.state.nextCast++,op,{x:130,y:130});expect(f.game.context.get(captured.id)).toBe(captured);expect(captured.hp).toBeGreaterThan(0);expect(captured.summoned!.expires).toBe(expires);f.game.restore(f.game.snapshot());
});
it('replays transfers identically across saves before and after the ownership change',()=>{
 const f=fixture(),g=fixture();expect(cast(f)).toBeNull();g.game.restore(f.game.snapshot());for(let i=0;i<10;i++){step(f);step(g);expect(g.game.checksum()).toBe(f.game.checksum());if(i===5)g.game.restore(f.game.snapshot());}expect(f.t.owner).toBe('player.1');
});
it('scores enemy conversion as valuable and never prefers an allied unit',()=>{
 const f=fixture(),caster={id:1,owner:'player.1',x:0,y:0,hp:100,maxHp:100,alive:true,targetable:true,unit:true,nature:'organic' as const},enemy={...caster,id:2,owner:'player.2',x:2};
 expect(abilityAimScore(f.a,1,caster,enemy,[caster,enemy],e=>e.id===1?'ally':'enemy','enemy')).toBeGreaterThan(0);expect(abilityAimScore(f.a,1,caster,enemy,[caster,enemy],()=> 'ally','enemy')).toBe(0);
});
it('workbench owner/team changes replay through the same simulation',async()=>{
 const s=new SpellEditorService('/tmp'),a=definition();await s.execute({op:'preview.load',document:{definition:a,presentation:{...presentation,effects:[],icon:undefined}},settings:{relationship:'enemy',targetCount:1}});const state=()=>s.state() as PreviewState;
 await s.execute({op:'preview.target',entity:2});await s.execute({op:'preview.cast'});await s.execute({op:'preview.seek',tick:20});expect(state().entities.find(e=>e.id===2)?.owner).toBe('player.1');const hash=state().checksum;await s.execute({op:'preview.seek',tick:0});expect(state().entities.find(e=>e.id===2)?.owner).toBe('player.2');await s.execute({op:'preview.seek',tick:20});expect(state().checksum).toBe(hash);
});

it('releases a working carrier from old jobs without losing its cargo or allowing old-player orders',()=>{
 const map=emptyUtcMap(),start=map.playerStarts[1];
 const g=new Game({...map,entities:[{...placed('tree','resource.forest.tree',start.x+10,start.z+4,{amount:10}),owner:'none'}]},slots,content);
 const workers=g.entities.filter(e=>e.owner==='player.2'&&g.registry.get(e.definition).behaviors.work),w=workers[0],tree=g.entities.find(e=>e.placement==='tree')!;
 g.command('player.2',{type:'stop',actors:workers.map(e=>e.id)});
 expect(g.command('player.2',{type:'gather',actors:[w.id],target:tree.id}).accepted).toBe(true);
 for(let i=0;i<1600&&!w.unit!.cargo;i++)g.tick();expect(w.unit!.cargo?.amount).toBeGreaterThan(0);const cargo=structuredClone(w.unit!.cargo);
 expect(new UnitOwnership(g).transfer(w,'player.1','allow-over-cap')).toBe(true);expect(w.unit!.cargo).toEqual(cargo);expect(w.unit!.job).toBeNull();expect(g.state.jobs.some(j=>j.worker===w.id)).toBe(false);
 expect(g.command('player.2',{type:'move',actors:[w.id],destination:{x:130,y:140}}).accepted).toBe(false);
 expect(g.command('player.1',{type:'move',actors:[w.id],destination:{x:130,y:140}}).accepted).toBe(true);g.restore(g.snapshot());
});
it('converts a queried group in stable order with partial success at the hard limit',()=>{
 const op={...convert,query:{center:'target' as const,radius:12,relations:['enemy' as const],allowSelf:false,includeBuildings:false,excludePrimary:false,maxTargets:8,order:'nearest' as const}};
 const f=fixture({targetCount:3},{onRelease:[op]});const population=f.game.context.populationCandidates();
 vi.spyOn(f.game.context,'populationCandidates').mockImplementation(()=>[...population,...Array.from({length:f.game.registry.rules.maxUnits-2},(_,i)=>({...f.c,id:10000+i}))]);
 expect(cast(f)).toBeNull();step(f,5);expect(f.game.entities.filter(e=>e.id!==f.caster&&e.owner==='player.1').map(e=>e.id)).toEqual([f.target]);expect(f.game.abilities.observedEvents().filter(e=>e.event==='converted')).toHaveLength(1);
});
