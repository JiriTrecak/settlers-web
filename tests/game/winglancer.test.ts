import {expect,it} from 'vitest';
import {game,placed,run} from './helpers';
import {fixed} from '../../src/sim/game/motion';
import {snapPlacement} from '../../src/shared/spatial/placement';

it('flies over blocked terrain and ground occupancy, retains native flight after restore, and obeys anti-air targeting',()=>{
 const g=game([placed('flyer','unit.ants.winglancer',100,100),{...placed('enemy','unit.ants.warrior',106,100),owner:'player.2'}, {...placed('ranged','unit.ants.archer',109,100),owner:'player.2'}]);
 const a=g.entities.find(e=>e.placement==='flyer')!,b=g.entities.find(e=>e.placement==='enemy')!,archer=g.entities.find(e=>e.placement==='ranged')!;
 expect(a.unit!.flight).toEqual({height:3});
 const s=g.spatial;for(let y=0;y<s.size;y++){s.occupied[y*s.size+103]=999;s.heights[y*s.size+103]=5000;}
 expect(s.clearSegment(fixed(a),fixed({x:112,y:100}),undefined,b)).toBe(false);
 expect(s.route(a,{x:112,y:100})).toBe(true);
 expect(g.command('player.2',{type:'attack',actors:[b.id],target:a.id}).accepted).toBe(false);
 expect(g.command('player.2',{type:'attack',actors:[archer.id],target:a.id}).accepted).toBe(true);
 const save=g.snapshot();g.restore(save);expect(g.snapshot()).toEqual(save);
 const flyer=g.entities.find(e=>e.id===a.id)!;expect(flyer.unit!.flight).toEqual({height:3});
});

it('lands its lance attack on ground enemies and cannot target another flying lancer',()=>{
 const g=game([placed('flyer','unit.ants.winglancer',100,100),{...placed('enemy','unit.ants.warrior',103,100),owner:'player.2'}, {...placed('air','unit.ants.winglancer',107,100),owner:'player.2'}]);
 const a=g.entities.find(e=>e.placement==='flyer')!,b=g.entities.find(e=>e.placement==='enemy')!,other=g.entities.find(e=>e.placement==='air')!;
 expect(g.command('player.1',{type:'attack',actors:[a.id],target:other.id}).accepted).toBe(false);
 const hp=b.hp!;expect(g.command('player.1',{type:'attack',actors:[a.id],target:b.id}).accepted).toBe(true);run(g,100);expect(b.hp!).toBeLessThan(hp);
});

it('trains from the barracks only after the Great Acorn Hall, with native flight enabled at birth',()=>{
 const g=game([placed('b','building.ants.barracks',160,180),placed('supply','building.ants.house',245,240)]),b=g.entities.find(e=>e.placement==='b')!;
 g.state.wallets['player.1']={'item.amber':10000,'item.wood':10000};
 expect(g.command('player.1',{type:'produce',actor:b.id,definition:'unit.ants.winglancer'}).accepted).toBe(false);
 const hall=g.registry.get('building.ants.great-mound');g.context.create({...placed('hall',hall.id,190,200),position:snapPlacement(hall,{x:190,y:200})});
 expect(g.command('player.1',{type:'produce',actor:b.id,definition:'unit.ants.winglancer'}).accepted).toBe(true);run(g,1200);
 const flyer=g.entities.find(e=>e.definition==='unit.ants.winglancer');expect(flyer).toBeDefined();expect(flyer!.unit!.flight).toEqual({height:3});
});
