import {expect,it} from 'vitest';
import {formationDestinations} from '../../src/sim/game/formation';
it('keeps single-unit destinations exact and group slots unique and walkable',()=>{
 expect(formationDestinations([{id:1,x:2,y:2}],{x:8,y:8},16,()=>true).get(1)).toEqual({x:8,y:8});
 const actors=Array.from({length:24},(_,i)=>({id:i+1,x:i%6,y:Math.floor(i/6)}));
 const out=formationDestinations(actors,{x:15,y:15},16,p=>p.x!==14);
 expect(out.size).toBe(24);expect(new Set([...out.values()].map(p=>`${p.x},${p.y}`)).size).toBe(24);
 expect([...out.values()].every(p=>p.x!==14 && p.x<16 && p.y<16)).toBe(true);
});
it('does not swap flanks just because selection order or unit IDs differ',()=>{
 const actors=[{id:8,x:10,y:10},{id:2,x:12,y:10},{id:7,x:11,y:10}];
 const out=formationDestinations(actors,{x:11,y:20},40,()=>true);
 expect(out.get(8)!.x).toBeLessThanOrEqual(out.get(2)!.x);
 expect([...formationDestinations([...actors].reverse(),{x:11,y:20},40,()=>true)]).toEqual([...out]);
});

it('translates compact ranks without swapping neighbors or reshaping the footprint',()=>{
 const actors=Array.from({length:12},(_,i)=>({id:i+1,x:10+i%4,y:10+Math.floor(i/4)}));
 const destination={x:30,y:30};
 const out=formationDestinations(actors,destination,64,()=>true,()=>true);
 for(const actor of actors)expect(out.get(actor.id)).toEqual({x:actor.x+18,y:actor.y+19});
 expect([...formationDestinations([...actors].reverse(),destination,64,()=>true,()=>true)]).toEqual([...out]);
});

it('falls back to compact walkable slots when a translated route is obstructed or rounds onto another member',()=>{
 const actors=Array.from({length:12},(_,i)=>({id:i+1,x:10+i%4,y:10+Math.floor(i/4)}));
 const out=formationDestinations(actors,{x:30,y:30},64,()=>true,from=>from.x!==10||from.y!==10);
 expect(out.size).toBe(12);
 expect(new Set([...out.values()].map(p=>`${p.x},${p.y}`)).size).toBe(12);
 expect(actors.some(a=>out.get(a.id)!.x!==a.x+18||out.get(a.id)!.y!==a.y+19)).toBe(true);
 const rounded=formationDestinations([{id:1,x:10.1,y:10},{id:2,x:10.3,y:10}],{x:30,y:30},64,()=>true);
 expect(new Set([...rounded.values()].map(p=>`${p.x},${p.y}`)).size).toBe(2);
});
