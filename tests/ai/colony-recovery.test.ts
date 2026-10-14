import {expect,it} from 'vitest';
import {economy} from '../../src/sim/ai/economy';
import {Frame,Geography} from '../../src/sim/ai/frame';
import {createMapBriefing} from '../../src/sim/ai/briefing';
import {newAIState} from '../../src/sim/ai/state';
import type {Action} from '../../src/shared/types/types';
import {game,placed,run} from '../game/helpers';

function planner(g:ReturnType<typeof game>) {
 const geo=new Geography(createMapBriefing(g.map,g.registry)),s=newAIState(geo.map.fingerprint,1);
 return ()=>{
  g.observation.update();const accepted:Action[]=[];
  economy(new Frame(g.view('player.1'),'player.1',g.registry,geo,g.state.tick),s,a=>{
   const result=g.command('player.1',a);if(result.accepted)accepted.push(a);return result.accepted;
  });
  return accepted;
 };
}
/** Wallet after paying the Hall's declared construction cost from `before`. */
function afterHall(g:ReturnType<typeof game>,before:Record<string,number>){
 const after:Record<string,number>={...before};
 for(const {item,amount} of g.registry.get('building.test.fort').creation!.items){after[item]=(after[item]??0)-amount;if(!after[item])delete after[item];}
 return after;
}
const hallTicks=(g:ReturnType<typeof game>)=>g.registry.get('building.test.fort').creation!.workTicks!+400;
it('rebuilds a destroyed Hall through ordinary placement and payment while another building survives',()=>{
 const g=game([placed('mound','building.test.house',245,240)]),hall=g.context.get(g.state.objectives['player.1'])!;
 g.economy.remove(hall);g.tick();expect(g.isDefeated('player.1')).toBe(false);
 const before={...g.state.wallets['player.1']},choose=planner(g);let actions:Action[]=[];
 for(let i=0;i<16&&!actions.length;i++)actions=choose();
 expect(actions).toMatchObject([{type:'build',definition:'building.test.fort'}]);
 expect(g.state.wallets['player.1']).toEqual(afterHall(g,before));
 const project=g.entities.find(e=>e.construction)!;expect(project.definition).toBe('building.test.fort');
 run(g,hallTicks(g));expect(project.construction).toBeUndefined();expect(g.isDefeated('player.1')).toBe(false);
});
it('explicitly replaces a dead builder without duplicating or recharging the foundation',()=>{
 const g=game(),w=g.entities.find(e=>e.owner==='player.1'&&g.registry.get(e.definition).behaviors.work)!;
 expect(g.command('player.1',{type:'build',actors:[w.id],definition:'building.test.house',position:{x:235.5,y:239.5}}).accepted).toBe(true);
 const project=g.entities.find(e=>e.construction)!;g.economy.remove(w);g.tick();
 const wallet={...g.state.wallets['player.1']},actions=planner(g)();
 expect(actions).toMatchObject([{type:'construct',target:project.id}]);expect(g.state.wallets['player.1']).toEqual(wallet);
 run(g,1300);expect(project.construction).toBeUndefined();expect(g.entities.filter(e=>e.definition==='building.test.house')).toHaveLength(1);
});

it('preserves Hall savings during bounded site searches and can use stranded loaded workers',()=>{
 const g=game([placed('mound','building.test.house',245,240)]),hall=g.context.get(g.state.objectives['player.1'])!;
 g.economy.remove(hall);
 const workers=g.entities.filter(e=>e.owner==='player.1'&&g.registry.get(e.definition).behaviors.work);
 for(const w of workers)w.unit!.cargo={item:'item.test.amber',amount:10};
 g.tick();const before={...g.state.wallets['player.1']},choose=planner(g);let actions:Action[]=[];
 for(let i=0;i<16&&!actions.length;i++)actions=choose();
 expect(actions).toMatchObject([{type:'build',definition:'building.test.fort'}]);
 const paid=afterHall(g,before);expect(g.state.wallets['player.1']).toEqual(paid);
 run(g,hallTicks(g)+400);expect(g.entities.find(e=>e.definition==='building.test.fort'&&e.owner==='player.1')!.construction).toBeUndefined();
 // Every starting worker returns the cargo held before the Hall was destroyed.
 expect(g.state.wallets['player.1']['item.test.amber']).toBe((paid['item.test.amber']??0)+workers.length*10);
 expect(workers.every(w=>!w.unit!.cargo)).toBe(true);
});
