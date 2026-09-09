import {expect,it} from 'vitest';
import {game,placed,run} from './helpers';
import {resourceStamps} from '../../src/presentation/scenery';

it('plants an exhausted site, restores its visual and blocker, and resumes harvesting to the hall',()=>{
 const g=game([placed('forester','building.ants.forester',205,220),{...placed('tree','resource.forest.tree',205,215,{amount:0}),owner:'none'}]);
 const tree=g.entities.find(e=>e.placement==='tree')!,hall=g.context.get(g.state.objectives['player.1'])!;
 const visible=()=>resourceStamps(g.view().entities).some(s=>s.id===`resource-${tree.id}`);
 expect(visible()).toBe(false);
 for(let i=0;i<1600&&tree.resource!.growingUntil===null;i++)g.tick();
 expect(tree.resource!.growingUntil).not.toBeNull();
 expect(tree.resource!.amount).toBe(0);expect(g.spatial.resources[g.spatial.cell(tree)]).toBe(0);
 const saved=g.snapshot(),restored=game([placed('forester','building.ants.forester',205,220),{...placed('tree','resource.forest.tree',205,215,{amount:0}),owner:'none'}]);restored.restore(saved);
 run(g,1700);run(restored,1700);expect(restored.snapshot()).toEqual(g.snapshot());
 expect(tree.resource!.amount).toBe(g.registry.get(tree.definition).yield);
 expect(visible()).toBe(true);expect(g.spatial.resources[g.spatial.cell(tree)]).toBe(tree.id);
 const worker=g.entities.find(e=>e.owner==='player.1'&&g.registry.get(e.definition).behaviors.work&&!e.unit?.employment)!;
 const before=hall.inventory['item.wood'];
 expect(g.command('player.1',{type:'gather',actors:[worker.id],target:tree.id}).accepted).toBe(true);
 run(g,2200);expect(hall.inventory['item.wood']).toBeGreaterThan(before);
});

it('does not materialize a mature tree under a unit, then restores it after the unit leaves',()=>{
 const g=game([{...placed('tree','resource.forest.tree',205,215,{amount:0}),owner:'none'}]);
 const tree=g.entities.find(e=>e.placement==='tree')!,guard=g.context.create(placed('guard','unit.ants.warrior',205,215));
 guard.readyTick=0;tree.resource!.growingUntil=g.state.tick+1;
 run(g,10);expect(tree.resource!.amount).toBe(0);expect(tree.resource!.growingUntil).not.toBeNull();
 expect(g.command('player.1',{type:'move',actors:[guard.id],destination:{x:210,y:215}}).accepted).toBe(true);
 run(g,150);expect(guard.x).toBe(210);expect(tree.resource!.amount).toBe(g.registry.get(tree.definition).yield);
 expect(tree.resource!.growingUntil).toBeNull();
});
