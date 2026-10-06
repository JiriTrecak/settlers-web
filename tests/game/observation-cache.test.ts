import {expect,it} from 'vitest';
import {game,worker,placed} from './helpers';
it('cached vision agrees with full rebuilding through movement, construction and restore',()=>{
 const make=()=>game([placed('scout','unit.ants.warrior',210,200)]);
 const a=make(),b=make();
 for(const g of [a,b]){
  expect(g.command('player.1',{type:'build',actors: [worker(g).id],definition:'building.ants.barracks',position:placed('site','building.ants.barracks',193.5,209.5).position}).accepted).toBe(true);
  const warrior=g.entities.find(e=>e.owner==='player.1'&&e.definition==='unit.ants.warrior')!;
  expect(g.command('player.1',{type:'move',actors:[warrior.id],destination:{x:190,y:230}}).accepted).toBe(true);
 }
 const retained=a.view('player.1'),oldCells=retained.fog!.cells.slice();
 for(let i=0;i<250;i++){
  // Drop derived sensor contributions to compare against rebuilding all footprints.
  (b.observation as any).masks.clear();
  a.tick();b.tick();
  if(i%50===0)expect(a.observation.snapshot()).toEqual(b.observation.snapshot());
 }
 expect(retained.fog!.cells).toEqual(oldCells);
 expect(a.checksum()).toBe(b.checksum());
 const saved=a.snapshot();a.restore(saved);a.tick();b.tick();expect(a.checksum()).toBe(b.checksum());
});
it('refreshes visible entity health without changing visibility arrays',()=>{
 const g=game(),before=g.view('player.1'),fort=g.entities.find(e=>e.owner==='player.1'&&e.definition==='building.ants.fort')!;
 fort.hp!-=10;g.observation.update();const after=g.view('player.1');
 expect(after.fog!.cells).toBe(before.fog!.cells);
 expect(after.entities.find(e=>e.id===fort.id)!.hp).toBe(fort.hp);
 expect(before.entities.find(e=>e.id===fort.id)!.hp).toBe(fort.hp!+10);
});
