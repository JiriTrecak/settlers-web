import {expect,it} from 'vitest';
import {game,placed} from './helpers';
import {precise} from '../../src/sim/game/motion';
import type {Entity} from '../../src/sim/game/state';

it('sector-filtered sight agrees with a full sensor scan across movement, ownership and containment',()=>{
 const g=game(Array.from({length:50},(_,i)=>({...placed('sensor'+i,'unit.ants.warrior',20+i%10*20,20+Math.floor(i/10)*20),owner:i%2?'player.1':'player.2'})));
 const sensors=g.entities.filter(e=>e.placement?.startsWith('sensor'));
 const brute=(target:Entity)=>target.owner==='player.1'||g.context.liveSensors().some(sensor=>sensor.owner==='player.1'&&!sensor.unit?.contained&&!sensor.unit?.release&&g.spatial.footprint(target).some(cell=>cell>=0&&((cell%g.spatial.size-sensor.x)**2+(Math.floor(cell/g.spatial.size)-sensor.y)**2)<=(g.context.def(sensor).vision??0)**2&&g.spatial.tactical.visible(sensor,g.spatial.point(cell))));
 for(let turn=0;turn<12;turn++){
  for(const [i,e] of sensors.entries()){
   e.x=20+(i*17+turn*7)%200;e.y=20+(i*23+turn*11)%200;e.unit!.position={x:e.x*1000+400,y:e.y*1000-400};
   e.unit!.contained=i%7===turn%7?g.state.objectives['player.1']!:null;
  }
  g.observation.update();
  for(const target of sensors)expect(g.observation.visible('player.1',target)).toBe(brute(target));
 }
 const moving=sensors[1]!;moving.unit!.contained=null;const target=sensors[0]!;
 moving.x=target.x+1;moving.y=target.y;moving.unit!.position=null;g.context.motionRevision++;
 expect(g.observation.visible('player.1',target)).toBe(brute(target));
 expect(precise(moving).x).toBe(moving.x);
});
it('resource sectors follow creation, removal and restore without changing harvest selection',()=>{
 const g=game([{...placed('tree','resource.forest.tree',31,31),owner:'none'}]);
 const tree=g.entities.find(e=>e.placement==='tree')!;
 expect(g.context.nearbyResources({x:32,y:32},2).map(e=>e.id)).toContain(tree.id);
 const saved=g.snapshot();g.context.remove(tree);expect(g.context.nearbyResources({x:32,y:32},2)).toHaveLength(0);
 g.restore(saved);expect(g.context.nearbyResources({x:32,y:32},2).map(e=>e.id)).toContain(tree.id);
});
