import {expect,it} from 'vitest';
import {game,worker} from './helpers';
import {fixed} from '../../src/sim/game/motion';

it('smooths a long route around a wall into legs that are each physically clear',()=>{
 const g=game(),actor=worker(g),spatial=g.spatial;
 actor.x=20;actor.y=21;actor.unit!.position={x:20006,y:20869};
 for(let y=0;y<=180;y++)spatial.terrain[y*spatial.size+105]=0;
 spatial.rebuild();
 const destination={x:220,y:200},clear=spatial.clearSegment.bind(spatial);
 expect(spatial.route(actor,destination,false)).toBe(true);
 expect(actor.unit!.route.length).toBeGreaterThan(1);
 expect(actor.unit!.route.at(-1)).toBe(spatial.cell(destination));
 let anchor=actor.unit!.position;
 for(const node of actor.unit!.route){const next=fixed(spatial.point(node));expect(clear(anchor,next,undefined,actor)).toBe(true);anchor=next;}
});
