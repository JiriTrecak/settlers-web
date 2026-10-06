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
it('rebuilds a destroyed Hall through ordinary placement and payment while another building survives',()=>{
 const g=game([placed('mound','building.ants.house',245,240)]),hall=g.context.get(g.state.objectives['player.1'])!;
 g.economy.remove(hall);g.tick();expect(g.isDefeated('player.1')).toBe(false);
 const choose=planner(g);let actions:Action[]=[];
 for(let i=0;i<16&&!actions.length;i++)actions=choose();
 expect(actions).toMatchObject([{type:'build',definition:'building.ants.fort'}]);
 expect(g.state.wallets['player.1']).toEqual({'item.amber':100});
 const project=g.entities.find(e=>e.construction)!;expect(project.definition).toBe('building.ants.fort');
 run(g,4000);expect(project.construction).toBeUndefined();expect(g.isDefeated('player.1')).toBe(false);
});
it('explicitly replaces a dead builder without duplicating or recharging the foundation',()=>{
 const g=game(),w=g.entities.find(e=>e.owner==='player.1'&&g.registry.get(e.definition).behaviors.work)!;
 expect(g.command('player.1',{type:'build',actors:[w.id],definition:'building.ants.house',position:{x:235.5,y:239.5}}).accepted).toBe(true);
 const project=g.entities.find(e=>e.construction)!;g.economy.remove(w);g.tick();
 const wallet={...g.state.wallets['player.1']},actions=planner(g)();
 expect(actions).toMatchObject([{type:'construct',target:project.id}]);expect(g.state.wallets['player.1']).toEqual(wallet);
 run(g,1300);expect(project.construction).toBeUndefined();expect(g.entities.filter(e=>e.definition==='building.ants.house')).toHaveLength(1);
});

it('preserves Hall savings during bounded site searches and can use stranded loaded workers',()=>{
 const g=game([placed('mound','building.ants.house',245,240)]),hall=g.context.get(g.state.objectives['player.1'])!;
 g.economy.remove(hall);
 const workers=g.entities.filter(e=>e.owner==='player.1'&&g.registry.get(e.definition).behaviors.work);
 for(const w of workers)w.unit!.cargo={item:'item.amber',amount:10};
 g.tick();const choose=planner(g);let actions:Action[]=[];
 for(let i=0;i<16&&!actions.length;i++)actions=choose();
 expect(actions).toMatchObject([{type:'build',definition:'building.ants.fort'}]);
 expect(g.state.wallets['player.1']).toEqual({'item.amber':100});
 run(g,4400);expect(g.entities.find(e=>e.definition==='building.ants.fort'&&e.owner==='player.1')!.construction).toBeUndefined();
 expect(g.state.wallets['player.1']['item.amber']).toBe(160);
});
