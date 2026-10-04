import {expect,it} from 'vitest';
import {coreAbilities} from '../../src/content/abilities/core';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {SpellCorpses,CORPSE_TICKS,MAX_CORPSES} from '../../src/sim/abilities/corpses';
import {colonySupply} from '../../src/sim/game/supply';
function fixture(settings={}){const a=coreAbilities.abilities.find(a=>a.id==='ability.core.holy-light')!;return createAbilityEncounter(a,coreAbilities.presentations.find(p=>p.id===a.presentation)!,encounterSettingsSchema.parse({relationship:'ally',...settings}));}
function die(f:ReturnType<typeof fixture>,id=f.target){const e=f.game.context.get(id)!;e.hp=0;f.game.onCombatDeath(e);return e;}
it('retains a dead unit without occupancy, supply, inventory or transient combat state',()=>{
 const f=fixture(),e=f.game.context.get(f.target)!,before=colonySupply(f.game.entities,'player.1',f.game.registry).used;
 const d=die(f);expect(f.game.context.get(f.target)).toBeUndefined();expect(f.game.state.corpses).toHaveLength(1);
 expect(f.game.state.corpses[0]).toMatchObject({id:e.id,definition:e.definition,owner:e.owner,died:0,expires:CORPSE_TICKS});
 expect(f.game.state.corpses[0]).not.toHaveProperty('inventory');expect(f.game.state.corpses[0]).not.toHaveProperty('unit');
 expect(colonySupply(f.game.entities,'player.1',f.game.registry).used).toBe(before-f.game.registry.get(e.definition).supplyCost!);
 f.game.onCombatDeath(d);expect(f.game.state.corpses).toHaveLength(1);
});
it('mechanical, summoned and contained units do not create usable corpses',()=>{
 const mechanical=fixture({targetNature:'mechanical'});die(mechanical);expect(mechanical.game.state.corpses).toEqual([]);
 for(const kind of ['summoned','contained']){const f=fixture(),e=f.game.context.get(f.target)!;if(kind==='summoned')e.summoned={source:f.caster,ability:'ability.core.feral-spirit',rank:1,cast:1,started:0,expires:100};else e.unit!.contained=f.caster;die(f);expect(f.game.state.corpses).toEqual([]);}
});
it('fallen heroes remain in the existing revival system, not the corpse store',()=>{
 const f=fixture(),hero=f.game.context.create({id:'hero',definition:'unit.ants.marshal',owner:'player.1',position:{x:125,y:125},rotation:0});die(f,hero.id);
 expect(f.game.context.get(hero.id)?.fallen).toBe(true);expect(f.game.state.corpses).toEqual([]);
});
it('consumes a corpse at most once and only before expiration',()=>{
 const f=fixture(),store=new SpellCorpses(f.game.context);die(f);expect(store.consume(f.target)?.id).toBe(f.target);expect(store.consume(f.target)).toBeUndefined();
 const g=fixture();die(g);g.game.state.tick=CORPSE_TICKS;const expired=new SpellCorpses(g.game.context);expect(expired.consume(g.target)).toBeUndefined();expired.tick();expect(g.game.state.corpses).toEqual([]);
});
it('retention is bounded and evicts the oldest death with stable ID tie-breaking',()=>{
 const f=fixture(),store=new SpellCorpses(f.game.context),e=structuredClone(f.game.context.get(f.target)!);e.hp=0;
 for(let i=MAX_CORPSES+3;i>=1;i--)store.capture({...e,id:1000+i});
 expect(f.game.state.corpses).toHaveLength(MAX_CORPSES);expect(f.game.state.corpses[0].id).toBe(1004);expect(f.game.state.corpses.at(-1)!.id).toBe(1000+MAX_CORPSES+3);
});
it('saves and replays corpse decay with the same checksum',()=>{
 const f=fixture(),g=fixture();die(f);g.game.restore(f.game.snapshot());for(let i=0;i<CORPSE_TICKS+1;i++){f.game.tick();g.game.tick();if(i%100===0)expect(g.game.checksum()).toBe(f.game.checksum());}expect(f.game.state.corpses).toEqual([]);expect(g.game.checksum()).toBe(f.game.checksum());
});
it('rejects duplicate, live-identity, out-of-map and forged expiry corpses atomically',()=>{
 const f=fixture();die(f);const original=f.game.snapshot(),hash=f.game.checksum();f.game.restore(original);
 for(const patch of [{id:f.caster},{id:99999},{expires:99999},{died:100},{position:{x:300,y:300}},{definition:'unit.ants.marshal'}]){const s=structuredClone(original);Object.assign(s.state.corpses[0],patch);expect(()=>f.game.restore(s)).toThrow();expect(f.game.checksum()).toBe(hash);}
 const duplicate=structuredClone(original);duplicate.state.corpses.push(structuredClone(duplicate.state.corpses[0]));expect(()=>f.game.restore(duplicate)).toThrow();expect(f.game.checksum()).toBe(hash);
});
it('retains spell ranks and absolute cooldowns but removes mana and pending casts',()=>{
 const f=fixture(),caster=f.game.context.get(f.caster)!;caster.abilities!.cooldowns['ability.core.holy-light']=100;caster.abilities!.mana=100;die(f,f.caster);
 const corpse=f.game.state.corpses[0];expect(corpse.abilities).toMatchObject({mana:0,regeneration:0,pending:null,ranks:{preview:1},cooldowns:{'ability.core.holy-light':100}});f.game.restore(f.game.snapshot());
 const corrupt=f.game.snapshot();corrupt.state.corpses[0].abilities!.ranks.preview=9;expect(()=>f.game.restore(corrupt)).toThrow();
});
