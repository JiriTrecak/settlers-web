import {expect,it} from 'vitest';
import {game,placed,run,worker} from './helpers';
it('uses a reachable service point when the nearest free doorway point is surrounded',()=>{
 const g=game([placed('site','building.ants.barracks',205,210)]),b=g.entities.find(e=>e.placement==='site')!,w=worker(g);
 const door=g.context.spatial.entrance(b);
 b.construction={progress:0,supportedHp:120};b.hp=120;
 b.inventory=Object.fromEntries(g.registry.get(b.definition).creation!.items.map(c=>[c.item,c.amount]));
 // Keep the door cell empty but surround it with stationary units. A free
 // service point two cells south remains reachable from the builder.
 for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
  if(!dx&&!dy)continue;
  const p={x:door.x+dx,y:door.y+dy};
  if(g.context.spatial.walkable(g.context.spatial.cell(p)))g.context.create(placed(`block-${dx}-${dy}`,'unit.ants.warrior',p.x,p.y));
 }
 w.x=door.x;w.y=door.y+5;w.unit!.position=null;w.unit!.segment=null;w.unit!.route=[];
 w.unit!.order={type:'construct',target:b.id};g.context.spatial.rebuild();
 run(g,200);
 expect(b.construction!.progress).toBeGreaterThan(0);
});
