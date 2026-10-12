import {expect,it} from 'vitest';
import {game,placed,run} from '../game/helpers';
import {SpellStatuses,spellControl} from '../../src/sim/abilities/statuses';
import {coreAbilities} from '../../src/content/abilities/core';
function fixture(hero=false){
 const g=game([placed('adept','unit.ants.amber-adept',215,230),{...placed('target',hero?'unit.ants.marshal':'unit.ants.banneret',228,230),owner:'player.2'}, {...placed('soldier','unit.ants.warrior',231,230),owner:'player.2'}]);
 const get=(id:string)=>g.entities.find(e=>e.placement===id)!;return {g,c:get('adept'),t:get('target'),soldier:get('soldier')};
}
function advance(g:ReturnType<typeof game>,n:number){for(let i=0;i<n;i++)g.tick(undefined,{passiveUnits:true});}
function untilFlight(g:ReturnType<typeof game>){for(let i=0;i<40&&!g.state.spellDeliveries.length;i++)advance(g,1);expect(g.state.spellDeliveries).toHaveLength(1);}
it('seals spellcasting on projectile arrival, allows weapons, and expires after its declared duration',()=>{
 const {g,c,t}=fixture(),hp=t.hp;
 expect(g.abilities.cast(c.id,'amber-seal',t.id)).toBeNull();untilFlight(g);
 expect(spellControl(t,g.registry,'silence')).toBe(false);expect(g.state.spellDeliveries).toHaveLength(1);
 let landed=false;for(let i=0;i<40;i++){advance(g,1);if(spellControl(t,g.registry,'silence')){landed=true;break;}}
 expect(landed).toBe(true);expect(t.hp).toBe(hp);expect(spellControl(t,g.registry,'disarm')).toBe(false);
 const s=t.spellStatuses!.find(s=>s.status==='amberSealed')!;expect(s.expires-s.started).toBe(120);
 expect(g.abilities.cast(t.id,'rallying-standard',t.id)).not.toBeNull();advance(g,121);expect(spellControl(t,g.registry,'silence')).toBe(false);
});
it('halves the silence on heroes and rejects units without mana',()=>{
 const {g,c,t,soldier}=fixture(true);expect(g.abilities.cast(c.id,'amber-seal',soldier.id)).not.toBeNull();
 expect(g.abilities.cast(c.id,'amber-seal',t.id)).toBeNull();advance(g,40);
 const s=t.spellStatuses!.find(s=>s.status==='amberSealed')!;expect(s.expires-s.started).toBe(60);
});
it('removes positive dispellable buffs while retaining negative statuses and health',()=>{
 const {g,c,t}=fixture();const rally=coreAbilities.abilities.find(a=>a.id==='ability.ants.rallying-standard')!,seal=coreAbilities.abilities.find(a=>a.id==='ability.ants.amber-seal')!;
 for(const a of [rally,seal]){const op=a.onRelease.find(e=>e.op==='status')!;new SpellStatuses(g).apply(c.id,t.id,a,1,g.state.nextCast++,op as never);}
 expect(t.spellStatuses?.some(s=>s.status==='rallied')).toBe(true);const hp=t.hp;
 expect(g.abilities.cast(c.id,'amber-sever',t.id)).toBeNull();advance(g,40);
 expect(t.spellStatuses?.some(s=>s.status==='rallied')).toBe(false);expect(spellControl(t,g.registry,'silence')).toBe(true);expect(t.hp).toBe(hp);
});
it('restores an in-flight seal deterministically without a second mana charge',()=>{
 const a=fixture(),b=fixture();expect(a.g.abilities.cast(a.c.id,'amber-seal',a.t.id)).toBeNull();untilFlight(a.g);const spent=a.c.abilities!.mana;expect(spent).toBe(125);
 b.g.restore(a.g.snapshot());for(let i=0;i<60;i++){advance(a.g,1);advance(b.g,1);expect(a.g.checksum()).toBe(b.g.checksum());}
 expect(a.c.abilities!.mana).toBeGreaterThanOrEqual(spent);expect(a.c.abilities!.mana).toBeLessThan(spent+5);
});
it('autocasts the seal at a nearby enemy caster',()=>{
 const {g,t}=fixture();for(const e of g.entities)if(e.unit)e.unit.order={type:'hold'};
 let sealed=false;for(let i=0;i<100;i++){g.tick();sealed ||= spellControl(t,g.registry,'silence');}expect(sealed).toBe(true);
});
it('recruits the new Adept with its two authored abilities from barracks',()=>{
 const g=game([placed('b','building.ants.barracks',160,180),placed('supply','building.ants.house',245,240)]),b=g.entities.find(e=>e.placement==='b')!;
 g.state.wallets['player.1']={'item.amber':10000,'item.wood':10000};expect(g.command('player.1',{type:'produce',actor:b.id,definition:'unit.ants.amber-adept'}).accepted).toBe(true);run(g,1150);
 const u=g.entities.find(e=>e.definition==='unit.ants.amber-adept')!;expect(u).toBeDefined();expect(g.registry.get(u.definition).behaviors.abilities!.bindings.map(b=>b.ability)).toEqual(['ability.ants.amber-seal','ability.ants.amber-sever']);
});
