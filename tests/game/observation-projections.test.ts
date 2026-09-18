import {expect,it} from 'vitest';
import {game,placed,worker} from './helpers';
it('refreshes visible scenery when an entity is replaced without changing the static count or sensors',()=>{
 const g=game([placed('scout','unit.ants.warrior',110,110),{...placed('old','resource.forest.tree',112,110),owner:'none'}]);
 const old=g.entities.find(e=>e.placement==='old')!;
 expect(g.view('player.1').entities.some(e=>e.id===old.id)).toBe(true);
 g.economy.remove(old);
 const replacement=g.context.create({...placed('new','resource.forest.tree',112,110),owner:'none'});
 g.observation.update();
 const current=g.view('player.1');expect(current.entities.some(e=>e.id===old.id)).toBe(false);expect(current.entities.some(e=>e.id===replacement.id)).toBe(true);
 const before=g.snapshot();g.restore(before);expect(g.snapshot()).toEqual(before);expect(g.view('player.1').entities).toEqual(current.entities);
});
it('shares unchanged resource projections while refreshing appearance and preserving older views',()=>{
 const g=game([placed('scout','unit.ants.warrior',110,110),{...placed('tree','resource.forest.tree',112,110),owner:'none'}]),tree=g.entities.find(e=>e.placement==='tree')!;
 const initial=g.view().entities.find(e=>e.id===tree.id)!;
 g.observation.update();expect(g.view().entities.find(e=>e.id===tree.id)).toBe(initial);
 tree.appearance={scale:1.4};tree.surface="bridge-test";g.observation.update();
 expect(g.view().entities.find(e=>e.id===tree.id)?.appearance?.scale).toBe(1.4);expect(initial.appearance?.scale).not.toBe(1.4);
 expect(g.view().entities.find(e=>e.id===tree.id)?.surface).toBe("bridge-test");expect(initial.surface).toBeUndefined();
 expect(g.view('player.1').entities.find(e=>e.id===tree.id)).toMatchObject({hostile:false,appearance:{scale:1.4}});
});

it('matches explicit rebuilds through axe contacts, falling, resource removal and restored views',()=>{
 const g=game([{...placed('tree','resource.forest.tree',205,215),owner:'none'}]);
 const w=worker(g),tree=g.entities.find(e=>e.placement==='tree')!;
 g.command(w.owner,{type:'gather',actors:[w.id],target:tree.id});
 for(let tick=0;tick<560;tick++){
  g.tick();
  if(tick%17!==0)continue;
  const views=[g.view(),g.view('player.1'),g.view('player.2')],hash=g.checksum();
  g.observation.update();
  expect([g.view(),g.view('player.1'),g.view('player.2')]).toEqual(views);expect(g.checksum()).toBe(hash);
 }
 const saved=g.snapshot(),view=g.view();g.restore(saved);expect(g.view()).toEqual(view);
 const removed=g.context.get(tree.id)!;g.economy.remove(removed);g.observation.update(true);
 expect(g.view().entities.some(e=>e.id===tree.id)).toBe(false);
});

it('publishes independent nested orders without exposing mutable state',()=>{
 const g=game([placed('unit','unit.ants.warrior',110,110)]),unit=g.entities.find(e=>e.placement==='unit')!;
 unit.unit!.order={type:'patrol',destination:{x:115,y:110},origin:{x:110,y:110}};
 unit.unit!.orderQueue=[{type:'move',destination:{x:116,y:110},attackMove:false}];
 g.observation.update();const before=g.view('player.1').entities.find(e=>e.id===unit.id)!.control!;
 unit.unit!.order.destination.x=125;(unit.unit!.orderQueue[0] as {destination:{x:number}}).destination.x=126;
 expect(before.order).toMatchObject({destination:{x:115}});expect(before.orderQueue[0]).toMatchObject({destination:{x:116}});
});
