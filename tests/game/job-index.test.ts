import {expect,it,vi} from 'vitest';
import {game,placed,worker} from './helpers';

it('tracks actual harvest job creation, cancellation and restored identity without scanning jobs on lookup',()=>{
 const g=game([{...placed('tree','resource.forest.tree',228,235),owner:'none'}]);
 const w=worker(g),tree=g.entities.find(e=>e.placement==='tree')!;
 const verify=()=>{
  for(const job of g.state.jobs)expect(g.context.job(job.id)).toBe(job);
  expect(g.context.job(null)).toBeUndefined();expect(g.context.job(-1)).toBeUndefined();
 };
 expect(g.command(w.owner,{type:'gather',actors:[w.id],target:tree.id}).accepted).toBe(true);
 for(let i=0;i<40&&w.unit!.job==null;i++)g.tick();
 expect(g.state.jobs.length).toBeGreaterThan(0);verify();
 const id=w.unit!.job!,original=g.context.job(id)!;
 const find=vi.spyOn(g.state.jobs,'find');
 for(let i=0;i<50;i++){
  expect(g.context.job(id)).toBe(original);
  expect(g.spatial.ignoresUnits(w)).toBe(true);
 }
 expect(find).not.toHaveBeenCalled();find.mockRestore();
 const snapshot=g.snapshot();g.restore(snapshot);verify();
 expect(g.context.job(id)).not.toBe(original);
 const restored=g.context.get(w.id)!;
 expect(g.spatial.ignoresUnits(restored)).toBe(true);
 expect(g.command(w.owner,{type:'move',actors:[w.id],destination:{x:220,y:220}}).accepted).toBe(true);
 expect(g.context.job(id)).toBeUndefined();expect(g.spatial.ignoresUnits(restored)).toBe(false);verify();
 g.command(w.owner,{type:'gather',actors:[w.id],target:tree.id});
 for(let i=0;i<40&&restored.unit!.job==null;i++)g.tick();
 expect(restored.unit!.job).not.toBeNull();expect(restored.unit!.job).not.toBe(id);verify();
 for(let i=0;i<40;i++){g.tick();verify();}
});
