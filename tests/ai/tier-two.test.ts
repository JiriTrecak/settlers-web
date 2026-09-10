import {expect,it} from 'vitest';
import {game,placed} from '../game/helpers';
import {Frame,Geography} from '../../src/sim/ai/frame';
import {createMapBriefing} from '../../src/sim/ai/briefing';
import {newAIState} from '../../src/sim/ai/state';
import {economy} from '../../src/sim/ai/economy';
import type {Action} from '../../src/shared/types/types';
function setup(){
 const g=game([
  placed('b','building.ants.barracks',195,190),placed('f','building.ants.ironroot-forge',225,190),placed('w','building.ants.bombardier-workshop',240,210),
  ...Array.from({length:4},(_,i)=>placed(`house${i}`,'building.ants.house',180+i*10,230)),
  ...Array.from({length:4},(_,i)=>placed(`worker${i}`,'unit.ants.settler',208+i,218)),
  ...Array.from({length:3},(_,i)=>placed(`soldier${i}`,'unit.ants.warrior',210+i,220)),
 ]);
 const mound=g.context.get(g.state.objectives['player.1'])!;mound.inventory={'item.amber':1000,'item.wood':1000,'item.root':100};
 const geo=new Geography(createMapBriefing(g.map,g.registry));
 const frame=()=>new Frame(g.view('player.1'),'player.1',g.registry,geo,g.state.tick);
 const decide=()=>{const actions:Action[]=[];economy(frame(),newAIState(geo.map.fingerprint,1),(a)=>{actions.push(a);return true});return actions;};
 return {g,mound,frame,decide};
}
it('uses shared prerequisites and only accepts Root with a completed specialized dropoff',()=>{
 const {g,mound,frame}=setup();expect(frame().canAfford(g.registry.get('unit.ants.hunter'))).toBe(false);expect(frame().accepts('item.root')).toBe(false);
 mound.definition='building.ants.great-mound';g.observation.update();expect(frame().canAfford(g.registry.get('unit.ants.hunter'))).toBe(true);
 const r=g.context.create(placed('rootworks','building.ants.rootworks',240,240));g.observation.update();expect(frame().accepts('item.root')).toBe(true);
 r.construction={progress:0} as typeof r.construction;g.observation.update();expect(frame().accepts('item.root')).toBe(false);
});
it('buys an affordable Great Mound upgrade using the normal command interface',()=>{
 const {g,mound,decide}=setup();const action=decide()[0];expect(action).toEqual({type:'upgrade',actor:mound.id});
 expect(g.command('player.1',action).accepted).toBe(true);expect(mound.inventory['item.root']??0).toBe(0);
});
it('chooses paid research for current units after reaching Tier 2',()=>{
 const {g,mound,decide}=setup();mound.definition='building.ants.great-mound';g.observation.update();
 const action=decide()[0];expect(action.type).toBe('research');expect(g.command('player.1',action).accepted).toBe(true);
});
it('places a Rootworks near an observed safe deposit, but not beside visible enemies',()=>{
 const {g,mound}=setup();mound.inventory['item.root']=0;
 g.context.create({...placed('root','building.neutral.corrupted-root',240,175),owner:'none'});g.observation.update();
 const geo=new Geography(createMapBriefing(g.map,g.registry));
 const choose=(danger=false)=>{
  const view={...g.view(),entities:[...g.view().entities]};view.fog={...g.view('player.1').fog!,cells:new Uint8Array(g.map.size*g.map.size).fill(2)};
  if(danger){const enemy=structuredClone(view.entities.find(e=>e.definition==='unit.ants.warrior')!);enemy.id=99999;enemy.owner='player.2';enemy.hostile=true;enemy.x=240;enemy.y=178;view.entities.push(enemy);}
  const actions:Action[]=[];economy(new Frame(view,'player.1',g.registry,geo,0),newAIState(geo.map.fingerprint,1),a=>{actions.push(a);return true});return actions;
 };
 const action=choose()[0];expect(action).toMatchObject({type:'build',definition:'building.ants.rootworks'});
 if(action.type==='build')expect(Math.hypot(action.position.x-240,action.position.y-175)).toBeLessThanOrEqual(12);
 expect(choose(true).some(a=>a.type==='build'&&a.definition==='building.ants.rootworks')).toBe(false);
});
it('preserves upgrade savings instead of spending every Amber delivery on recruits',()=>{
 const {g,mound,decide}=setup();
 for(let i=0;i<5;i++)g.context.create(placed(`reserve-army-${i}`,'unit.ants.warrior',205+i,220));
 mound.inventory={'item.amber':150,'item.wood':100,'item.root':0};
 g.observation.update();
 expect(decide().some(a=>a.type==='produce')).toBe(false);
 // Once the next investment is funded, use the ordinary upgrade action.
 mound.inventory={'item.amber':320,'item.wood':180,'item.root':100};g.observation.update();
 expect(decide()[0]).toEqual({type:'upgrade',actor:mound.id});
});
it('staffs a new Rootworks by rebalancing empty-handed gatherers, preserving cargo and a source floor',()=>{
 const {g,mound}=setup();mound.inventory={'item.wood':2000,'item.amber':0,'item.root':0};
 const root=g.context.create({...placed('rebalance-root','building.neutral.corrupted-root',240,175),owner:'none'});
 g.context.create(placed('rebalance-dropoff','building.ants.rootworks',240,187));
 const tree=g.context.create({...placed('rebalance-tree','resource.forest.tree',215,218),owner:'none'});
 const workers=g.entities.filter(e=>e.owner==='player.1'&&g.registry.get(e.definition).behaviors.work);
 workers.forEach(w=>{w.unit!.order={type:'gather',target:tree.id};});
 workers[0].unit!.cargo={item:'item.wood',amount:10};g.observation.update();
 const geo=new Geography(createMapBriefing(g.map,g.registry)),s=newAIState(geo.map.fingerprint,1);
 const choose=()=>{const a:Action[]=[];economy(new Frame(g.view('player.1'),'player.1',g.registry,geo,0),s,x=>{a.push(x);return true});return a;};
 // The planner first releases its explicit builder/recruit reserve.
 const reserve=g.registry.rules.ai.workers.reserve;
 for(const w of workers.slice(-reserve))w.unit!.order=null;
 g.observation.update();
 const action=choose().find(a=>a.type==='gather');
 expect(action).toMatchObject({type:'gather',target:root.id});
 if(action?.type==='gather')expect(action.actors).not.toContain(workers[0].id);
 expect(s.inspected['economy:rebalance']).toBe(200);
 expect(choose().some(a=>a.type==='gather')).toBe(false);
});
it('saves for an unlocked underrepresented Hunter instead of endlessly buying cheaper Warriors',()=>{
 const {g,mound,decide}=setup();mound.definition='building.ants.great-mound';
 g.state.research['player.1']=Object.keys(g.registry.rules.research);
 for(let i=0;i<8;i++)g.context.create(placed(`mix-worker-${i}`,'unit.ants.settler',210+i,225));
 for(let i=0;i<4;i++)g.context.create(placed(`archer-mix-${i}`,'unit.ants.archer',212+i,219));
 mound.inventory={'item.amber':150,'item.wood':100,'item.root':100};g.observation.update();
 expect(decide().some(a=>a.type==='produce')).toBe(false);
 mound.inventory['item.amber']=190;g.observation.update();
 expect(decide()[0]).toMatchObject({type:'produce',definition:'unit.ants.hunter'});
});
it('still buys affordable emergency troops below the army floor',()=>{
 const {g,mound,decide}=setup();mound.definition='building.ants.great-mound';
 g.state.research['player.1']=Object.keys(g.registry.rules.research);
 for(let i=0;i<8;i++)g.context.create(placed(`emergency-worker-${i}`,'unit.ants.settler',210+i,225));
 const soldiers=g.entities.filter(e=>e.owner==='player.1'&&g.registry.get(e.definition).behaviors.combat&&!g.registry.get(e.definition).behaviors.work);
 for(const e of soldiers.slice(3))g.context.remove(e);
 mound.inventory={'item.amber':100,'item.wood':100,'item.root':100};g.observation.update();
 expect(decide()[0]).toMatchObject({type:'produce',definition:'unit.ants.warrior'});
});
