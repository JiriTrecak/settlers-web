import {expect,it} from 'vitest';
import {game,placed,run} from './helpers';
import type {AuthoredDefinition,Placement} from '../../src/content/schema';
import {resourceStamps} from '../../src/presentation/scenery';

// Regrowth remains available to custom content; ranked forests do not enable it.
function regrowthGame(entities:Placement[]) {
 return game(entities,draft=>{
  const defs=draft.definitions as AuthoredDefinition[];
  const tree=defs.find(d=>d.id==='resource.forest.tree')!;
  tree.regrowthTicks=1600;tree.creation={method:'plant',items:[],workTicks:80};
  defs.find(d=>d.id==='building.ants.forester')!.behaviors!.production={mode:'automatic',outputs:[tree.id],workerSlots:1,workRadius:28,jobName:'Forester'};
 });
}

it('plants an exhausted site, restores its visual and blocker, and resumes harvesting to the hall',()=>{
 const g=regrowthGame([placed('forester','building.ants.forester',193.5,237.5),{...placed('tree','resource.forest.tree',200,220,{amount:0}),owner:'none'}]);
 const tree=g.entities.find(e=>e.placement==='tree')!,hall=g.context.get(g.state.objectives['player.1'])!;
 const visible=()=>resourceStamps(g.view().entities).some(s=>s.id===`resource-${tree.id}`);
 expect(visible()).toBe(false);
 for(let i=0;i<1600&&tree.resource!.growingUntil===null;i++)g.tick();
 expect(tree.resource!.growingUntil).not.toBeNull();
 expect(tree.resource!.amount).toBe(0);expect(g.spatial.resources[g.spatial.cell(tree)]).toBe(0);
 const saved=g.snapshot(),restored=regrowthGame([placed('forester','building.ants.forester',193.5,237.5),{...placed('tree','resource.forest.tree',200,220,{amount:0}),owner:'none'}]);restored.restore(saved);
 run(g,1700);run(restored,1700);expect(restored.snapshot()).toEqual(g.snapshot());
 expect(tree.resource!.amount).toBe(g.registry.get(tree.definition).yield);
 expect(tree.resource!.felling).toMatchObject({hp:50,lastHitTick:null,fallTick:null});
 expect(visible()).toBe(true);expect(g.spatial.resources[g.spatial.cell(tree)]).toBe(tree.id);
 const worker=g.entities.find(e=>e.owner==='player.1'&&g.registry.get(e.definition).behaviors.work&&!e.unit?.employment)!;
 const before=g.state.wallets[hall.owner]['item.wood'];
 expect(g.command('player.1',{type:'gather',actors:[worker.id],target:tree.id}).accepted).toBe(true);
 run(g,2200);expect(g.state.wallets[hall.owner]['item.wood']).toBeGreaterThan(before);
});

it('does not materialize a mature tree under a unit, then restores it after the unit leaves',()=>{
 const g=regrowthGame([{...placed('tree','resource.forest.tree',200,220,{amount:0}),owner:'none'}]);
 const tree=g.entities.find(e=>e.placement==='tree')!,guard=g.context.create(placed('guard','unit.ants.warrior',200,220));
 guard.readyTick=0;g.context.setRegrowth(tree,g.state.tick+1);
 run(g,10);expect(tree.resource!.amount).toBe(0);expect(tree.resource!.growingUntil).not.toBeNull();
 expect(g.command('player.1',{type:'move',actors:[guard.id],destination:{x:195,y:220}}).accepted).toBe(true);
 run(g,150);expect(guard.x).toBe(195);expect(tree.resource!.amount).toBe(g.registry.get(tree.definition).yield);
 expect(tree.resource!.growingUntil).toBeNull();
});
