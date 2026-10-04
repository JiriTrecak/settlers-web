import {expect,it} from 'vitest';
import {abilitySchema,type AbilityDefinition} from '../../src/content/abilities/schema';
import {coreAbilities} from '../../src/content/abilities/core';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {abilityAimScore} from '../../src/sim/abilities/ai';
import {SpellEditorService} from '../../tooling/spell-editor/server/service';
import type {PreviewState} from '../../tooling/spell-editor/shared/view';
const base=coreAbilities.abilities.find(a=>a.id==='ability.core.spirit-swarm')!,p=coreAbilities.presentations.find(p=>p.id===base.presentation)!;
function fixture(delivery:Record<string,unknown>={},settings:Record<string,unknown>={},extra:Partial<AbilityDefinition>={}){
 const a=abilitySchema.parse({...base,cast:{...base.cast,prepareTicks:0,recoverTicks:0,cost:{...base.cast.cost,amount:0}},delivery:{...base.delivery,count:1,speed:8,launchIntervalTicks:0,maxHitsPerTrip:1,returnPermille:1000,...delivery},...extra});
 const f=createAbilityEncounter(a,p,encounterSettingsSchema.parse({relationship:'enemy',targetCount:1,targetHealth:500,distance:8,mana:1000,...settings}));
 return {...f,a,c:()=>f.game.context.get(f.caster)!,t:()=>f.game.context.get(f.target)!};
}
type Fixture=ReturnType<typeof fixture>;
function tick(f:Fixture,n=1){for(let i=0;i<n;i++)f.game.tick(undefined,{passiveUnits:true});}
function cast(f:Fixture){expect(f.game.command('player.1',{type:'castAbility',actor:f.caster,binding:'preview',target:{kind:'unit',entity:f.caster}}).accepted).toBe(true);tick(f);}
function until(f:Fixture,condition:()=>boolean,max=1000){while(!condition()&&max-->0)tick(f);expect(condition()).toBe(true);}
it('only heals after a real return trip, including when the caster moves',()=>{
 const f=fixture();f.c().hp=100;cast(f);until(f,()=>f.t().hp!<500);expect(f.c().hp).toBe(100);expect(f.game.state.spellDeliveries[0].swarm).toMatchObject({phase:'returning',health:10});
 f.c().x-=4;tick(f,5);expect(f.c().hp).toBe(100);until(f,()=>f.c().hp!>100);expect(f.c().hp).toBe(110);
 expect(f.game.abilities.observedEvents().filter(e=>e.event==='returned')).toHaveLength(1);
});
it('stagger launches and per-target caps distribute the group without hitting hidden or allied actors',()=>{
 const f=fixture({count:6,launchIntervalTicks:8,maxPerTarget:2,speed:1},{targetCount:3,targetSpacing:2});cast(f);expect(f.game.abilities.observedDeliveries()).toHaveLength(0);tick(f);expect(f.game.abilities.observedDeliveries()).toHaveLength(1);
 tick(f,8);expect(f.game.abilities.observedDeliveries()).toHaveLength(2);tick(f,32);
 const counts=new Map<number,number>();for(const d of f.game.state.spellDeliveries)if(d.target)counts.set(d.target,(counts.get(d.target)??0)+1);
 expect([...counts.values()].sort()).toEqual([2,2,2]);expect([...counts.keys()].every(id=>f.game.context.get(id)!.owner==='player.2')).toBe(true);
 f.game.restore(f.game.snapshot());
});
it('lost targets, immunity and changed ownership cannot receive a queued bite',()=>{
 const f=fixture();cast(f);tick(f,10);const shot=f.game.state.spellDeliveries[0];expect(shot.target).toBe(f.target);
 f.t().owner='player.1';tick(f,60);expect(f.t().hp).toBe(500);expect(f.c().hp).toBe(f.game.context.stats(f.c()).maxHp);
});
it.each(['death','conversion','removal'] as const)('source %s cancels every seeker and its cargo',mode=>{
 const f=fixture({count:3,launchIntervalTicks:4});f.c().hp=100;cast(f);until(f,()=>f.game.state.spellDeliveries.some(d=>d.swarm!.health>0));
 if(mode==='death'){f.c().hp=0;f.game.onCombatDeath(f.c());}else if(mode==='conversion')f.c().owner='player.2';else f.game.context.remove(f.c());
 tick(f);expect(f.game.state.spellDeliveries).toHaveLength(0);expect(f.game.abilities.observedEvents().some(e=>e.event==='returned')).toBe(false);
});
it('expiry recalls loaded seekers and permits delivery, but no new bites',()=>{
 const f=fixture({durationTicks:60,speed:8,maxHitsPerTrip:10,returnThreshold:1000});f.c().hp=100;cast(f);tick(f,59);const before=f.t().hp!;expect(before).toBeLessThan(500);expect(f.c().hp).toBe(100);
 tick(f,100);expect(f.t().hp).toBe(before);expect(f.c().hp).toBe(100+500-before);expect(f.game.state.spellDeliveries).toHaveLength(0);
});
it('carries actual overkill-limited damage and never restores the authored maximum',()=>{
 const f=fixture({returnPermille:750},{targetHealth:5});f.c().hp=100;cast(f);until(f,()=>f.game.abilities.observedEvents().some(e=>e.event==='returned'));
 expect(f.c().hp).toBe(103);expect(f.game.abilities.observedEvents().find(e=>e.event==='drained')?.amount).toBe(5);
});
it('mana payloads use the same delayed return and clamp to capacity',()=>{
 const f=fixture({}, {},{onRelease:[{op:'drain',target:'target',amount:30,resource:'mana',restoreCaster:true,damageType:'spell',damagePerDrainedPermille:0}]});
 const t=f.game.context.create({id:'mage',definition:'unit.ants.marshal',owner:'player.2',position:{x:125,y:120},rotation:270});t.abilities!.mana=17;f.game.context.remove(f.t());f.c().abilities!.mana=100;cast(f);
 until(f,()=>t.abilities!.mana===0);expect(f.c().abilities!.mana).toBe(100);until(f,()=>f.c().abilities!.mana>100);expect(f.c().abilities!.mana).toBe(117);
});
it('damage-only payloads return after their bounded trip without healing',()=>{
 const f=fixture({maxHitsPerTrip:2},{},{onRelease:[{op:'damage',target:'target',amount:10,damageType:'spell'}]});f.c().hp=100;cast(f);until(f,()=>f.game.state.spellDeliveries[0].swarm!.phase==='returning');expect(f.t().hp).toBe(480);tick(f,50);expect(f.c().hp).toBe(100);
});
it('tracks height for airborne victims and rejects ground-only swarm filters',()=>{
 const f=fixture({}, {targetLocomotion:'air'});cast(f);tick(f,20);expect(f.game.abilities.observedDeliveries()[0].position.height).toBeGreaterThan(0);until(f,()=>f.t().hp!<500);expect(f.game.abilities.observedEvents().find(e=>e.event==='impact')?.point.height).toBe(6);
 const g=fixture({filter:{locomotion:['ground']}},{targetLocomotion:'air'});cast(g);tick(g,160);expect(g.t().hp).toBe(500);
});
it('ranked count, lifetime and threshold are validated at every rank',()=>{
 expect(()=>abilitySchema.parse({...base,ranks:[{count:2,life:100,threshold:10},{count:3,life:200,threshold:20}],delivery:{...base.delivery,count:{rankParameter:'count'},durationTicks:{rankParameter:'life'},returnThreshold:{rankParameter:'threshold'}}})).not.toThrow();
 for(const d of [{count:0},{count:33},{returnThreshold:0},{count:20,durationTicks:100,launchIntervalTicks:8}])expect(()=>abilitySchema.parse({...base,delivery:{...base.delivery,...d}})).toThrow();
 expect(()=>abilitySchema.parse({...base,targeting:{...base.targeting,kind:'unit'}})).toThrow();
});
it('rejects corrupted durable seeker records atomically',()=>{
 const f=fixture({count:3,launchIntervalTicks:8});cast(f);tick(f,10);const hash=f.game.checksum();
 for(const mutate of [(d:any)=>delete d.swarm,(d:any)=>d.swarm.group=d.cast,(d:any)=>d.swarm.index=9,(d:any)=>d.swarm.expires++,(d:any)=>d.swarm.launchTick++,(d:any)=>d.swarm.health=-1,(d:any)=>d.swarm.phase='waiting',(d:any)=>d.swarm.hits=2]){
  const save=f.game.snapshot();mutate(save.state.spellDeliveries[0]);expect(()=>f.game.restore(save)).toThrow();expect(f.game.checksum()).toBe(hash);
 }
 const save=f.game.snapshot();save.state.spellDeliveries[1].swarm!.index=0;save.state.spellDeliveries[1].swarm!.launchTick=save.state.spellDeliveries[0].swarm!.launchTick;expect(()=>f.game.restore(save)).toThrow();
});
it('replays launches, bites, cargo and returns identically through JSON restores',()=>{
 const f=fixture({count:6,launchIntervalTicks:8},{targetCount:3,targetSpacing:2}),g=fixture({count:6,launchIntervalTicks:8},{targetCount:3,targetSpacing:2});cast(f);g.game.restore(JSON.parse(JSON.stringify(f.game.snapshot())));
 for(let i=0;i<350;i++){tick(f);tick(g);if(i%37===0)g.game.restore(JSON.parse(JSON.stringify(f.game.snapshot())));expect(g.game.checksum(),`tick ${i}`).toBe(f.game.checksum());expect(g.game.abilities.observedDeliveries()).toEqual(f.game.abilities.observedDeliveries());}
});
it('scores observed enemy payloads, never the self-cast target',()=>{
 const f=fixture();const actor=(e:ReturnType<Fixture['c']>)=>({id:e.id,x:e.x,y:e.y,owner:e.owner,hp:e.hp!,maxHp:500,alive:true,targetable:true,unit:true,locomotion:'ground' as const});
 const c=actor(f.c()),t=actor(f.t()),relation=(e:typeof c)=>e.owner===c.owner?'ally' as const:'enemy' as const;
 expect(abilityAimScore(f.a,1,c,c,[c,t],relation,'enemy')).toBeGreaterThan(0);expect(abilityAimScore(f.a,1,c,c,[c],relation,'enemy')).toBe(0);
});
it('publishes a reusable proof and rewinds repeated workbench casts with saved seeker poses',async()=>{
 const s=new SpellEditorService(process.cwd());await s.execute({op:'preview.load',document:{definition:base,presentation:p},settings:{relationship:'enemy',targetCount:3,targetHealth:500,distance:8}});
 for(let i=0;i<3;i++){await s.execute({op:'preview.cast'});await s.execute({op:'preview.seek',tick:190});const state=s.state() as PreviewState;expect(state.events.some(e=>e.event==='returned')).toBe(true);expect(state.deliveries?.length).toBeGreaterThan(0);const hash=state.checksum;await s.execute({op:'preview.seek',tick:1});await s.execute({op:'preview.seek',tick:190});expect((s.state() as PreviewState).checksum).toBe(hash);}
});
it('prevents admission beyond the world delivery budget without partial groups or spending mana',()=>{
 const f=fixture({count:32,speed:1},{targetCount:0});
 for(let i=0;i<16;i++){f.c().abilities!.cooldowns={};cast(f);}expect(f.game.state.spellDeliveries).toHaveLength(512);
 f.c().abilities!.cooldowns={};const mana=f.c().abilities!.mana;expect(f.game.abilities.cast(f.caster,'preview',f.caster)).toBe('Too many active spell deliveries');expect(f.c().abilities!.mana).toBe(mana);expect(f.game.state.spellDeliveries).toHaveLength(512);f.game.restore(f.game.snapshot());
});
it('forgets unseen targets instead of following their hidden positions',()=>{
 const f=fixture({speed:1,radius:32});cast(f);tick(f,5);expect(f.game.state.spellDeliveries[0].target).toBe(f.target);
 f.t().x=f.c().x+31;f.t().y=f.c().y;tick(f,5);expect(f.game.state.spellDeliveries[0].target).toBe(0);expect(f.t().hp).toBe(500);
});
it('cannot bite through a newly applied spell immunity',async()=>{
 const {SpellStatuses}=await import('../../src/sim/abilities/statuses');const {releaseEffects}=await import('../../src/content/abilities/schema');
 const f=fixture({speed:1});cast(f);tick(f,5);
 const protection=coreAbilities.abilities.find(a=>a.id==='ability.core.avatar')!;
 for(const op of releaseEffects(protection,1,'ally'))new SpellStatuses(f.game).apply(f.target,f.target,protection,1,f.game.state.nextCast++,op);
 tick(f,120);expect(f.t().hp).toBeGreaterThanOrEqual(500);expect(f.game.abilities.observedEvents().some(e=>e.event==='drained')).toBe(false);
});
it('expires even if the source keeps outrunning the returning seeker',()=>{
 const f=fixture({durationTicks:60,returnTimeoutTicks:10,speed:1});cast(f);tick(f,59);f.c().x-=20;tick(f,11);expect(f.game.state.spellDeliveries).toHaveLength(0);
});
it('uses real delayed multiplayer commits with a mid-flight World restore',async()=>{
 const {Room,Lockstep,MemoryChannel}=await import('../../src/net');const {World}=await import('../../src/sim/world/world');const {localMatch}=await import('../../src/shared');
 const f=fixture({count:8,launchIntervalTicks:8},{targetCount:3}),opts={map:f.game.map,slots:f.game.slots,registry:f.game.registry,seed:23};
 const worlds=[new World(opts),new World(opts)],config={...localMatch({mapId:'swarm-proof',mapRevision:'test',seed:23,slotCount:2,me:0,delay:3}),slots:[...f.game.slots]};
 const room=new Room(config),channels=[new MemoryChannel(room,0),new MemoryChannel(room,1)],peers=channels.map((c,i)=>new Lockstep(c,i,3));
 peers[0].send({type:'castAbility',actor:f.caster,binding:'preview',target:{kind:'unit',entity:f.caster}});
 let launched=false,hit=false;try{for(let tick=1;tick<=350;tick++){
  peers[tick%2].confirm(tick);peers[1-tick%2].confirm(tick);
  for(let i=0;i<2;i++){const commit=peers[i].take(tick)!;expect(commit).toBeTruthy();for(const slot of commit.slots)slot.actions.forEach((action,seq)=>worlds[i].enqueue(action,commit.tick,{player:slot.player,seq}));worlds[i].tick();}
  launched ||= worlds[0].settlement.state.spellDeliveries.length>0;hit ||= worlds[0].settlement.abilities.observedEvents().some(e=>e.event==='drained');
  if(tick===70){const snapshot=JSON.parse(JSON.stringify(worlds[1].snapshot()));worlds[1]=new World(opts);worlds[1].restore(snapshot);}
  expect(worlds[1].checksum(),`lockstep tick ${tick}`).toBe(worlds[0].checksum());
 }expect(launched).toBe(true);expect(hit).toBe(true);}finally{channels.forEach(c=>c.destroy());}
});
it('ends editor delivery tracks when the caster disappears, not at the maximum return timeout',async()=>{
 const s=new SpellEditorService(process.cwd());await s.execute({op:'preview.load',document:{definition:base,presentation:p},settings:{relationship:'enemy',distance:8}});await s.execute({op:'preview.cast'});await s.execute({op:'preview.seek',tick:80});await s.execute({op:'preview.kill',subject:'caster'});await s.execute({op:'preview.step',ticks:2});const state=s.state() as PreviewState;
 expect(state.deliveries).toHaveLength(0);const tracks=state.timelineEvents.filter(e=>e.event==='projectile');expect(tracks.length).toBeGreaterThan(0);expect(tracks.every(e=>e.endedTick!==undefined&&e.endedTick<=82)).toBe(true);
});
