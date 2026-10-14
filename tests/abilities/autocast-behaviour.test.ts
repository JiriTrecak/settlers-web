import {expect,it} from 'vitest';
import {game,placed} from '../game/helpers';

// AI autocast of declared unit bindings during ordinary play (test units with ranged snare / heal / cleanse kits).
const enemy=(id:string,definition:string,x:number,y=230)=>({...placed(id,definition,x,y),owner:'player.2' as const});

it('autocasts a hostile projectile spell from ordinary ranged-attack distance',()=>{
 const g=game([placed('caster','unit.test.silkwarden',215,230),enemy('enemy','unit.test.warrior',232)]);
 const c=g.entities.find(e=>e.placement==='caster')!,t=g.entities.find(e=>e.placement==='enemy')!;t.unit!.order={type:'hold'};
 const binding=g.registry.get(c.definition).behaviors.abilities!.bindings[0];
 let launched=false,applied=false;
 for(let i=0;i<100;i++){g.tick();launched||=g.state.spellDeliveries.some(d=>d.source===c.id&&d.ability===binding.ability);applied||=!!t.spellStatuses?.some(s=>s.ability===binding.ability);}
 expect(launched).toBe(true);expect(applied).toBe(true);
});

it('autocasts a heal on a wounded ally from behind the front line without leaving its position',()=>{
 const g=game([placed('healer','unit.test.nectarist',215,230),placed('ally','unit.test.warrior',232,230)]);
 const t=g.entities.find(e=>e.placement==='ally')!,c=g.entities.find(e=>e.placement==='healer')!;t.hp=100;t.unit!.order={type:'hold'};c.unit!.order={type:'hold'};
 for(let i=0;i<100;i++)g.tick();
 expect(t.hp).toBeGreaterThan(100);expect(c.x).toBe(215);expect(g.abilities.drainEvents().some(e=>e.event==='healed'&&e.target===t.id)).toBe(true);
});

it('a friendly negative-polarity dispel removes a harmful status without damaging the ally',()=>{
 const g=game([placed('healer','unit.test.nectarist',215,230),placed('ally','unit.test.warrior',224,230),enemy('enemy','unit.test.silkwarden',230)]);
 const c=g.entities.find(e=>e.placement==='healer')!,t=g.entities.find(e=>e.placement==='ally')!,e=g.entities.find(e=>e.placement==='enemy')!;
 expect(g.abilities.cast(e.id,'silken-snare',t.id)).toBeNull();for(let i=0;i<40;i++)g.tick(undefined,{passiveUnits:true});
 const snare=g.registry.get(e.definition).behaviors.abilities!.bindings[0].ability;expect(t.spellStatuses?.some(s=>s.ability===snare)).toBe(true);
 const hp=t.hp;expect(g.abilities.cast(c.id,'nectar-cleanse',t.id)).toBeNull();for(let i=0;i<40;i++)g.tick(undefined,{passiveUnits:true});
 expect(t.spellStatuses?.length??0).toBe(0);expect(t.hp).toBe(hp);
});
