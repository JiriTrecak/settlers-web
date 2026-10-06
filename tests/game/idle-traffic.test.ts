import {expect,it,vi} from 'vitest';
import {game,placed} from './helpers';
import {fixed,precise} from '../../src/sim/game/motion';

function fixture(rotation=0){
 const turn=(x:number,y:number)=>{for(let n=0;n<rotation;n++)[x,y]=[255-y,x];return{x,y};};
 const locations=[[100,100],[103,100],[100,103],[100,97],[97,100]];
 const placements=locations.map(([x,y],i)=>{const p=turn(x,y);return placed('body-'+i,'unit.ants.warrior',p.x,p.y);});
 const g=game(placements),army=placements.map(p=>g.entities.find(e=>e.placement===p.id)!),mover=army[0];
 const destination=turn(120,100);
 expect(g.command(mover.owner,{type:'move',actors:[mover.id],destination}).accepted).toBe(true);
 return {g,army,mover,destination};
}

it.each([0,1,2,3])('idle allies yield through checked movement and replay a mid-yield restore, rotation %i',rotation=>{
 const {g,army,mover,destination}=fixture(rotation),copy=fixture(rotation).g;
 const search=vi.spyOn(g.spatial,'findPath');let saved=false,sawYield=false;
 for(let tick=0;tick<600;tick++){
  const before=army.map(e=>fixed(precise(e)));g.tick();
  for(let i=0;i<army.length;i++){
   const p=fixed(precise(army[i]));
   expect(g.spatial.clearSegment(before[i],p,undefined,army[i])).toBe(true);
   expect(Math.hypot(p.x-before[i].x,p.y-before[i].y)).toBeLessThanOrEqual(301);
   for(let j=0;j<i;j++)expect(Math.hypot(precise(army[i]).x-precise(army[j]).x,precise(army[i]).y-precise(army[j]).y)).toBeGreaterThanOrEqual(2.999);
  }
  if(tick<39)expect(army.slice(1).some(e=>e.unit!.route.length)).toBe(false);
  const yielding=army.slice(1).find(e=>e.unit!.detour?.yielding);
  sawYield||=!!yielding;
  if(saved){copy.tick();expect(copy.checksum('full')).toBe(g.checksum('full'));}
  else if(yielding){copy.restore(JSON.parse(JSON.stringify(g.snapshot())));saved=true;}
 }
 expect(saved&&sawYield).toBe(true);expect(precise(mover)).toEqual(destination);
 expect(army.every(e=>!e.unit!.order&&!e.unit!.route.length&&!e.unit!.detour&&e.unit!.goal===null)).toBe(true);
 expect(search).not.toHaveBeenCalled();
});

it('Hold Position remains an immovable player instruction',()=>{
 const {g,army,mover}=fixture();
 g.command('player.1',{type:'hold',actors:army.slice(1).map(e=>e.id)});
 const before=army.map(e=>({...precise(e)}));
 for(let tick=0;tick<400;tick++)g.tick();
 expect(army.map(e=>precise(e))).toEqual(before);
 expect(mover.unit!.order?.type).toBe('move');
 expect(army.slice(1).every(e=>e.unit!.order?.type==='hold'&&!e.unit!.detour)).toBe(true);
});

it('a replacement Stop cancels an idle ally yield immediately',()=>{
 const {g,army}=fixture();let yielding;
 for(let tick=0;tick<300&&!yielding;tick++){g.tick();yielding=army.slice(1).find(e=>e.unit!.detour?.yielding);}
 expect(yielding).toBeDefined();const before={...precise(yielding!)};
 g.command('player.1',{type:'stop',actors:[yielding!.id]});
 expect(yielding!.unit!.detour).toBeUndefined();g.tick();expect(precise(yielding!)).toEqual(before);
});
