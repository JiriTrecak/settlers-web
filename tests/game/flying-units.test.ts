import {expect,it} from 'vitest';
import {game,placed,run} from './helpers';
import {fixed} from '../../src/sim/game/motion';

it('a flyer crosses blocked terrain and ground occupancy, keeps flight after restore, and only anti-air units can target it',()=>{
 const g=game([placed('flyer','unit.test.winglancer',100,100),{...placed('enemy','unit.test.warrior',106,100),owner:'player.2'}, {...placed('ranged','unit.test.archer',109,100),owner:'player.2'}]);
 const a=g.entities.find(e=>e.placement==='flyer')!,b=g.entities.find(e=>e.placement==='enemy')!,archer=g.entities.find(e=>e.placement==='ranged')!;
 expect(a.unit!.flight).toEqual({height:3});
 const s=g.spatial,wall=g.context.create(placed('wall','building.test.house',104,100));
 for(let y=0;y<s.size;y++){s.terrain[y*s.size+103]=0;s.heights[y*s.size+103]=5000;}
 s.rebuild();expect(s.occupied[s.cell(wall)]).toBe(wall.id);
 expect(s.clearSegment(fixed(a),fixed({x:112,y:100}),undefined,b)).toBe(false);
 expect(s.route(a,{x:112,y:100})).toBe(true);
 expect(g.command('player.2',{type:'attack',actors:[b.id],target:a.id}).accepted).toBe(false);
 expect(g.command('player.2',{type:'attack',actors:[archer.id],target:a.id}).accepted).toBe(true);
 const save=g.snapshot();g.restore(save);expect(g.snapshot()).toEqual(save);
 const flyer=g.entities.find(e=>e.id===a.id)!;expect(flyer.unit!.flight).toEqual({height:3});
});

it('a ground-only flyer attacks ground enemies and cannot target another flyer',()=>{
 const g=game([placed('flyer','unit.test.winglancer',100,100),{...placed('enemy','unit.test.warrior',103,100),owner:'player.2'}, {...placed('air','unit.test.winglancer',107,100),owner:'player.2'}]);
 const a=g.entities.find(e=>e.placement==='flyer')!,b=g.entities.find(e=>e.placement==='enemy')!,other=g.entities.find(e=>e.placement==='air')!;
 expect(g.command('player.1',{type:'attack',actors:[a.id],target:other.id}).accepted).toBe(false);
 const hp=b.hp!;expect(g.command('player.1',{type:'attack',actors:[a.id],target:b.id}).accepted).toBe(true);run(g,100);expect(b.hp!).toBeLessThan(hp);
});
