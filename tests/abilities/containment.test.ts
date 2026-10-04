import {expect,it,vi} from 'vitest';
import {abilitySchema,releaseEffects,type Effect} from '../../src/content/abilities/schema';
import {coreAbilities} from '../../src/content/abilities/core';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {SpellContainments} from '../../src/sim/abilities/containment';
import {UnitOwnership} from '../../src/sim/game/ownership';
import {SpellEditorService} from '../../tooling/spell-editor/server/service';
import type {PreviewState} from '../../tooling/spell-editor/shared/view';
import {Game} from '../../src/sim/game/game';
import {SpellStatuses} from '../../src/sim/abilities/statuses';
const base=coreAbilities.abilities.find(a=>a.id==='ability.core.holy-light')!;
const presentation=coreAbilities.presentations.find(p=>p.id===base.presentation)!;
const op:Extract<Effect,{op:'contain'}>={op:'contain',id:'stomach',target:'target',amount:80,lifetime:'duration',capacity:1,digestion:{intervalTicks:8,damage:5,damageType:'spell'}};
function fixture(settings={},patch={},operation=op){const a=abilitySchema.parse({...base,ranks:[base.ranks[0]],targeting:{...base.targeting,relations:['enemy'],filter:{heroes:false,natures:['organic','undead']},condition:undefined},cast:{...base.cast,prepareTicks:2,recoverTicks:1},onRelease:[operation],...patch}),f=createAbilityEncounter(a,presentation,encounterSettingsSchema.parse({relationship:'enemy',targetCount:1,targetHealth:300,mana:1000,...settings}));return {...f,a,c:f.game.context.get(f.caster)!,t:f.game.context.get(f.target)!};}
const step=(f:ReturnType<typeof fixture>,n=1)=>{for(let i=0;i<n;i++)f.game.tick(undefined,{passiveUnits:true});};
const cast=(f:ReturnType<typeof fixture>)=>f.game.abilities.cast(f.caster,'preview',f.target);
function hold(f:ReturnType<typeof fixture>){expect(cast(f)).toBeNull();step(f,5);expect(f.t.unit!.contained).toBe(f.caster);}
it('optionally shares moving carrier sight with passenger allies and cleans it up after removal and restore',()=>{
 for(const enabled of [false,true]){
  const original=fixture({}, {},{...op,shareVision:enabled,digestion:undefined,lifetime:'untilDeath'});
  const game=new Game(original.game.map,[{player:0,kind:'human',team:0},{player:1,kind:'human',team:1},{player:2,kind:'human',team:1},{player:3,kind:'human',team:2}],original.game.registry);
  const f={...original,game,c:game.context.get(original.caster)!,t:game.context.get(original.target)!};hold(f);
  f.c.x=180;f.c.y=120;f.c.unit!.position=null;game.context.motionRevision++;step(f);game.observation.update();
  const cell=[120*256+180];for(const owner of ['player.2','player.3'] as const){expect(game.observation.currentlyVisible(owner,cell)).toBe(enabled);expect(game.observation.visible(owner,f.c)).toBe(enabled);}
  expect(game.observation.currentlyVisible('player.4',cell)).toBe(false);
  expect(game.command('player.2',{type:'move',actors:[f.caster],destination:{x:190,y:120}}).accepted).toBe(false);
  const saved=game.snapshot();game.context.remove(f.t);game.observation.update();expect(game.observation.currentlyVisible('player.2',cell)).toBe(false);
  game.restore(saved);game.observation.update();expect(game.observation.currentlyVisible('player.2',cell)).toBe(enabled);
 }
});
it('shared containment sight does not expose a concealed carrier or borrow its detection',()=>{
 const f=fixture({}, {},{...op,shareVision:true,digestion:undefined,lifetime:'untilDeath'});hold(f);
 f.c.x=180;f.c.unit!.position=null;f.game.context.motionRevision++;step(f);
 const invis=coreAbilities.abilities.find(a=>a.id==='ability.core.invisibility')!;
 for(const effect of releaseEffects(invis,1,'ally'))new SpellStatuses(f.game).apply(f.caster,f.caster,invis,1,f.game.state.nextCast++,effect);
 step(f,30);f.game.observation.update();
 expect(f.game.observation.currentlyVisible('player.2',[120*256+180])).toBe(true);
 expect(f.game.observation.detects('player.2',f.c)).toBe(false);expect(f.game.observation.visible('player.2',f.c)).toBe(false);
});
it('publishes Devour with carrier sight and ground-only admission',()=>{
 const a=coreAbilities.abilities.find(a=>a.id==='ability.core.devour')!,p=coreAbilities.presentations.find(p=>p.id===a.presentation)!;
 expect(a.onRelease.some(op=>op.op==='contain'&&op.shareVision)).toBe(true);
 const f=createAbilityEncounter(a,p,encounterSettingsSchema.parse({relationship:'enemy',targetLocomotion:'air',distance:4}));
 expect(f.game.abilities.cast(f.caster,'preview',f.target!)).toMatch(/filter/i);
});
it('contains the original unit, hides it from targets and movement, and digests on fixed ticks',()=>{
 const f=fixture();f.t.unit!.order={type:'move',destination:{x:150,y:140},attackMove:false};hold(f);
 expect(f.t.unit!.order).toBeNull();expect(f.game.context.activeUnits()).not.toContain(f.t);expect(f.game.context.get(f.target)).toBe(f.t);
 expect(f.game.command('player.2',{type:'move',actors:[f.target],destination:{x:130,y:130}}).accepted).toBe(false);
 expect(f.game.abilities.observedEvents().some(e=>e.event==='contained')).toBe(true);
 const next=f.t.spellContainment!.nextTick;step(f,next-f.game.state.tick);expect(f.t.hp).toBeLessThan(300);expect(f.game.abilities.observedEvents().some(e=>e.event==='digested')).toBe(true);f.game.restore(f.game.snapshot());
});
it('releases on timeout with remaining health and unchanged ownership',()=>{
 const f=fixture();hold(f);const expires=f.t.spellContainment!.expires;step(f,expires-f.game.state.tick);expect(f.t.spellContainment).toBeUndefined();expect(f.t.unit!.contained).toBeNull();expect(f.t.owner).toBe('player.2');expect(f.t.hp).toBeGreaterThan(0);expect(f.t.hp).toBeLessThan(300);expect(f.game.abilities.observedEvents().some(e=>e.event==='releasedContained')).toBe(true);f.game.restore(f.game.snapshot());
});
it('releases immediately when carrier dies, is removed or changes owner',()=>{
 for(const action of ['death','remove','convert']){const f=fixture();hold(f);if(action==='death'){f.c.hp=0;f.game.onCombatDeath(f.c);}else if(action==='remove')f.game.economy.remove(f.c);else expect(new UnitOwnership(f.game).transfer(f.c,'player.2','allow-over-cap')).toBe(true);expect(f.t.spellContainment).toBeUndefined();expect(f.t.unit!.contained).toBeNull();expect(f.t.owner).toBe('player.2');f.game.restore(f.game.snapshot());}
});
it('rejects occupied carriers, self/nested containment, heroes and unavailable targets',()=>{
 const f=fixture({targetCount:3}),h=new SpellContainments(f.game);hold(f);const other=f.game.entities.find(e=>e.unit&&e.id!==f.caster&&e.id!==f.target)!;
 expect(h.reason(f.c,other,1)).toMatch(/full/);expect(h.reason(other,f.c,1)).toMatch(/occupied/);expect(h.reason(f.c,f.c,1)).not.toBeNull();expect(h.reason(other,f.t,1)).not.toBeNull();
 for(const settings of [{targetHero:true},{targetNature:'mechanical' as const},{initialStatuses:['ability.core.spell-ward']}])expect(cast(fixture(settings))).not.toBeNull();
});
it('rechecks capacity at release and refunds the rejected preparation',()=>{
 const f=fixture({targetCount:3});expect(cast(f)).toBeNull();const other=f.game.entities.find(e=>e.unit&&e.id!==f.caster&&e.id!==f.target)!;
 expect(new SpellContainments(f.game).hold(f.c,other,f.a,1,f.game.state.nextCast++,op)).toBeGreaterThan(0);step(f,5);expect(f.t.unit!.contained).toBeNull();expect(f.c.abilities!.mana).toBe(1000);
});
it('finishes digestion through normal death handling without leaving an edible corpse',()=>{
 const f=fixture({}, {},{...op,digestion:{...op.digestion!,damage:10000}});hold(f);step(f,12);expect(f.game.context.get(f.target)).toBeUndefined();expect(f.game.state.corpses.some(c=>c.id===f.target)).toBe(false);expect(new SpellContainments(f.game).occupants(f.caster)).toEqual([]);f.game.restore(f.game.snapshot());
});
it('retries a blocked release without exposing or stacking the passenger',()=>{
 const f=fixture();hold(f);const nearest=vi.spyOn(f.game.spatial,'nearest').mockReturnValue(null);new SpellContainments(f.game).releaseHosted(f.caster);expect(f.t.unit!.release).not.toBeNull();expect(f.game.context.activeUnits()).not.toContain(f.t);nearest.mockRestore();step(f,3);expect(f.t.unit!.release).toBeNull();f.game.restore(f.game.snapshot());
});
it('supports safe transport without digestion and explicit release',()=>{
 const f=fixture({}, {},{...op,digestion:undefined,lifetime:'untilDeath'});hold(f);step(f,100);expect(f.t.hp).toBe(300);expect(new SpellContainments(f.game).releaseHosted(f.caster)).toBe(1);expect(f.t.spellContainment).toBeUndefined();
});
it('keeps save/load and lockstep hashes identical across digestion and release',()=>{
 const f=fixture(),g=fixture();expect(cast(f)).toBeNull();g.game.restore(f.game.snapshot());for(let i=0;i<90;i++){step(f);step(g);expect(g.game.checksum()).toBe(f.game.checksum());if(i===12||i===85)g.game.restore(f.game.snapshot());}
});
it('rejects forged containment provenance atomically',()=>{
 for(const field of ['host','cast','nextTick','expires','operation']){const f=fixture();hold(f);const s=f.game.snapshot(),record=s.state.entities.find(e=>e.id===f.target)!.spellContainment!;if(field==='operation')record.operation='missing';else (record as any)[field]=999999;const hash=f.game.checksum();expect(()=>f.game.restore(s)).toThrow();expect(f.game.checksum()).toBe(hash);}
});
it('workbench removes held actors and restores them on timeline rewind and carrier death',async()=>{
 const f=fixture(),s=new SpellEditorService('/tmp');await s.execute({op:'preview.load',document:{definition:f.a,presentation:{...presentation,effects:[],icon:undefined}},settings:{relationship:'enemy',targetCount:1}});const state=()=>s.state() as PreviewState;
 await s.execute({op:'preview.target',entity:2});await s.execute({op:'preview.cast'});await s.execute({op:'preview.seek',tick:20});expect(state().entities.some(e=>e.id===2)).toBe(false);const hash=state().checksum;await s.execute({op:'preview.seek',tick:0});expect(state().entities.some(e=>e.id===2)).toBe(true);await s.execute({op:'preview.seek',tick:20});expect(state().checksum).toBe(hash);await s.execute({op:'preview.kill',subject:'caster'});expect(state().entities.some(e=>e.id===2)).toBe(true);
});
it('preserves the strictest active capacity across different containment declarations',()=>{
 const f=fixture({targetCount:3}),h=new SpellContainments(f.game);hold(f);const other=f.game.entities.find(e=>e.unit&&e.id!==f.caster&&e.id!==f.target)!;expect(h.reason(f.c,other,8)).toMatch(/full/);expect(h.hold(f.c,other,f.a,1,f.game.state.nextCast++,{...op,capacity:8})).toBe(0);f.game.restore(f.game.snapshot());
});
it('executes the declared release operation through the shared effect service',()=>{
 const f=fixture();hold(f);const before=f.game.abilities.observedEvents().filter(e=>e.event==='releasedContained').length;
 // The operation recipient is the carrier; release emits one event per held unit.
 return import('../../src/sim/abilities/statuses').then(({SpellStatuses})=>{expect(new SpellStatuses(f.game).apply(f.caster,f.caster,f.a,1,f.game.state.nextCast++,{op:'releaseContained',target:'caster',amount:1},false,f.c.owner,f.c,{aim:f.c,origin:f.c})).toBe(1);expect(f.t.unit!.contained).toBeNull();expect(f.game.abilities.observedEvents().filter(e=>e.event==='releasedContained')).toHaveLength(before+1);});
});
it('retains cargo, stops casts and regeneration, and keeps supply occupied',()=>{
 const f=fixture();f.c.unit!.cargo={item:'resource.wood',amount:1};expect(cast(f)).toBeNull();const mana=f.c.abilities!.mana;
 // Reverse the hold so the prepared caster becomes the passenger.
 expect(new SpellContainments(f.game).hold(f.t,f.c,f.a,1,f.game.state.nextCast++,{...op,digestion:undefined})).toBeGreaterThan(0);expect(f.c.abilities!.pending).toBeNull();expect(f.c.abilities!.mana).toBeGreaterThan(mana);f.c.abilities!.mana=10;step(f,20);expect(f.c.abilities!.mana).toBe(10);expect(f.c.unit!.cargo).toEqual({item:'resource.wood',amount:1});expect(f.game.context.populationCandidates()).toContain(f.c);
});
