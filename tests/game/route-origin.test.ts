import {expect,it} from 'vitest';
import {game,placed} from './helpers';
import {fixed,precise} from '../../src/sim/game/motion';

function scenario(definition='unit.ants.warrior',rotation=0){
 const turn=(p:{x:number;y:number})=>{let{x,y}=p;for(let n=0;n<rotation;n++)[x,y]=[255-y,x];return{x,y};};
 const obstacle=turn({x:111.5,y:99.5}),start=turn({x:100,y:100});
 const placements=[placed('obstacle','building.ants.house',obstacle.x,obstacle.y),placed('mover',definition,start.x,start.y)];
 const g=game(placements),e=g.entities.find(e=>e.placement==='mover')!;
 const p=turn({x:107.5-g.spatial.dimensions(e).radius-.3,y:100});
 e.x=Math.round(p.x);e.y=Math.round(p.y);e.unit!.position=fixed(p);
 return {g,e,placements,destination:turn({x:140,y:100})};
}

it.each(['unit.ants.warrior','unit.ants.bombardier'].flatMap(definition=>[0,1,2,3].map(rotation=>({definition,rotation}))))(
 'joins a valid route from beside an obstacle without snapping, $definition rotation $rotation',({definition,rotation})=>{
 const {g,e,placements,destination}=scenario(definition,rotation),before={...precise(e)};
 expect(g.spatial.clearSegment(fixed(before),fixed(before),undefined,e)).toBe(true);
 expect(g.spatial.route(e,destination,false)).toBe(true);
 expect(precise(e)).toEqual(before);
 // Every planned join is physically valid, including the first fractional step.
 let anchor=fixed(before);
 for(const cell of e.unit!.route){const next=fixed(g.spatial.point(cell));expect(g.spatial.clearSegment(anchor,next,undefined,e)).toBe(true);anchor=next;}
 expect(g.command(e.owner,{type:'move',actors:[e.id],destination}).accepted).toBe(true);
 const copy=game(placements);copy.restore(JSON.parse(JSON.stringify(g.snapshot())));
 for(let tick=0;tick<400;tick++){
  const p=fixed(precise(e));g.tick();copy.tick();
  expect(g.checksum('full')).toBe(copy.checksum('full'));
  expect(g.spatial.clearSegment(p,fixed(precise(e)),undefined,e)).toBe(true);
  expect(Math.hypot(precise(e).x-p.x/1000,precise(e).y-p.y/1000)).toBeLessThanOrEqual(g.registry.get(definition).behaviors.movement!.speed/40+.002);
 }
 expect(precise(e)).toEqual(destination);expect(e.unit!.order).toBeNull();
});

it('uses the same safe origin for bounded traffic probes and respects the route budget',()=>{
 const {g,e,destination,placements}=scenario(),before={...precise(e)};
 expect(g.spatial.clearSegment(fixed(before),fixed(e),undefined,e)).toBe(false);
 expect(g.spatial.routeBatch(e,()=>g.spatial.route(e,destination,true,1000))).toBe(false);
 expect(g.spatial.routeBatch(e,()=>g.spatial.route(e,destination,true,100000))).toBe(true);
 expect(precise(e)).toEqual(before);
 const copy=game(placements);copy.restore(g.snapshot());
 expect(copy.spatial.route(copy.context.get(e.id)!,destination,true,100000)).toBe(true);
 expect(copy.checksum('full')).toBe(g.checksum('full'));
});
