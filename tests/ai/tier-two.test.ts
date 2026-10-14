import type {AuthoredDefinition} from '../../src/content/schema';
import {expect,it} from 'vitest';
import {game,placed} from '../game/helpers';
import {Frame,Geography} from '../../src/sim/ai/frame';
import {createMapBriefing} from '../../src/sim/ai/briefing';
import {newAIState} from '../../src/sim/ai/state';
import {economy} from '../../src/sim/ai/economy';
import type {Action} from '../../src/shared/types/types';
import {revivalTerms} from '../../src/content/revival';
const AMBER='item.test.amber',WOOD='item.test.wood',ROOT='item.test.root';
/** A declared price as a wallet. */
const price=(items:readonly {item:string;amount:number}[])=>Object.fromEntries(items.map(p=>[p.item,p.amount])) as Record<string,number>;
function setup(singleHeroRoster=false){
 const g=game([
  placed('b','building.test.barracks',195,190),placed('f','building.test.ironroot-forge',225,190),placed('w','building.test.bombardier-workshop',240,210),
  ...Array.from({length:4},(_,i)=>placed(`house${i}`,'building.test.house',180+i*10,230)),
  ...Array.from({length:4},(_,i)=>placed(`worker${i}`,'unit.test.settler',208+i,218)),
  ...Array.from({length:3},(_,i)=>placed(`soldier${i}`,'unit.test.warrior',210+i,220)),
 ],src=>{
  // Composition tests isolate troop savings from investing in additional heroes.
  if(singleHeroRoster)for(const d of src.definitions as AuthoredDefinition[]){
   const production=d.behaviors?.production;
   if(production?.outputs)production.outputs=production.outputs.filter(id=>id!=='unit.test.rootbreaker');
  }
 });
 const mound=g.context.get(g.state.objectives['player.1'])!;g.state.wallets[mound.owner]={'item.test.amber':1000,'item.test.wood':1000,'item.test.root':100};
 const geo=new Geography(createMapBriefing(g.map,g.registry));
 const frame=()=>new Frame(g.view('player.1'),'player.1',g.registry,geo,g.state.tick);
 const decide=()=>{const actions:Action[]=[];economy(frame(),newAIState(geo.map.fingerprint,1),(a)=>{actions.push(a);return true});return actions;};
 return {g,mound,frame,decide};
}
it('uses shared prerequisites and only accepts Root with a completed specialized dropoff',()=>{
 const {g,mound,frame}=setup();expect(frame().canAfford(g.registry.get('unit.test.hunter'))).toBe(false);expect(frame().accepts('item.test.root')).toBe(false);
 mound.definition='building.test.great-mound';g.observation.update();expect(frame().canAfford(g.registry.get('unit.test.hunter'))).toBe(true);
 const r=g.context.create(placed('rootworks','building.test.rootworks',240,240));g.observation.update();expect(frame().accepts('item.test.root')).toBe(true);
 r.construction={progress:0} as typeof r.construction;g.observation.update();expect(frame().accepts('item.test.root')).toBe(false);
});
it('buys an affordable Great Mound upgrade using the normal command interface',()=>{
 const {g,mound,decide}=setup();const action=decide()[0];expect(action).toEqual({type:'upgrade',actor:mound.id});
 const before={...g.state.wallets[mound.owner]},cost=price(g.registry.get(mound.definition).upgrade!.items);
 expect(g.command('player.1',action).accepted).toBe(true);
 for(const item of [AMBER,WOOD,ROOT])expect(g.state.wallets[mound.owner][item]??0).toBe((before[item]??0)-(cost[item]??0));
});
it('chooses paid research for current units after reaching Tier 2',()=>{
 const {g,mound,decide}=setup();mound.definition='building.test.great-mound';g.observation.update();
 const action=decide()[0];expect(action.type).toBe('research');expect(g.command('player.1',action).accepted).toBe(true);
});
it('places a Rootworks near an observed safe deposit, but not beside visible enemies',()=>{
 const {g,mound}=setup();g.state.wallets[mound.owner]['item.test.root']=0;
 g.context.create({...placed('root','building.test.neutral-corrupted-root',240,175),owner:'none'});g.observation.update();
 const geo=new Geography(createMapBriefing(g.map,g.registry));
 const choose=(danger=false)=>{
  const view={...g.view('player.1'),entities:[...g.view().entities]};view.fog={...g.view('player.1').fog!,cells:new Uint8Array(g.map.size*g.map.size).fill(2)};
  if(danger){const enemy=structuredClone(view.entities.find(e=>e.definition==='unit.test.warrior')!);enemy.id=99999;enemy.owner='player.2';enemy.hostile=true;enemy.x=240;enemy.y=178;view.entities.push(enemy);}
  const actions:Action[]=[];economy(new Frame(view,'player.1',g.registry,geo,0),newAIState(geo.map.fingerprint,1),a=>{actions.push(a);return true});return actions;
 };
 const action=choose()[0];expect(action).toMatchObject({type:'build',definition:'building.test.rootworks'});
 if(action.type==='build')expect(Math.hypot(action.position.x-240,action.position.y-175)).toBeLessThanOrEqual(g.registry.get('building.test.rootworks').placementNear!.radius);
 expect(choose(true).some(a=>a.type==='build'&&a.definition==='building.test.rootworks')).toBe(false);
});
it('preserves upgrade savings instead of spending every Amber delivery on recruits',()=>{
 const {g,mound,decide}=setup();
 for(let i=0;i<5;i++)g.context.create(placed(`reserve-army-${i}`,'unit.test.warrior',205+i,220));
 const upgrade=price(g.registry.get(mound.definition).upgrade!.items),recruit=price(g.registry.get('unit.test.warrior').creation!.items);
 // A recruit is affordable, the upgrade is not.
 const short={[AMBER]:recruit[AMBER]!+15,[WOOD]:upgrade[WOOD]!/2,[ROOT]:0};
 expect(short[AMBER]).toBeLessThan(upgrade[AMBER]!);
 g.state.wallets[mound.owner]=short;
 g.observation.update();
 expect(decide().some(a=>a.type==='produce')).toBe(false);
 // Once the next investment is funded, use the ordinary upgrade action.
 g.state.wallets[mound.owner]={...upgrade,[ROOT]:100};g.observation.update();
 expect(decide()[0]).toEqual({type:'upgrade',actor:mound.id});
});
it('staffs a new Rootworks by rebalancing empty-handed gatherers, preserving cargo and a source floor',()=>{
 const {g,mound}=setup();g.state.wallets[mound.owner]={'item.test.wood':2000,'item.test.amber':0,'item.test.root':0};
 const root=g.context.create({...placed('rebalance-root','building.test.neutral-corrupted-root',240,175),owner:'none'});
 g.context.create(placed('rebalance-dropoff','building.test.rootworks',240,187));
 const tree=g.context.create({...placed('rebalance-tree','resource.test.forest-tree',215,218),owner:'none'});
 const workers=g.entities.filter(e=>e.owner==='player.1'&&g.registry.get(e.definition).behaviors.work);
 workers.forEach(w=>{w.unit!.order={type:'gather',target:tree.id};});
 workers[0].unit!.cargo={item:'item.test.wood',amount:10};g.observation.update();
 const geo=new Geography(createMapBriefing(g.map,g.registry)),s=newAIState(geo.map.fingerprint,1);
 const choose=()=>{const a:Action[]=[];economy(new Frame(g.view('player.1'),'player.1',g.registry,geo,0),s,x=>{a.push(x);return true});return a;};
 // The planner first releases its explicit builder/recruit reserve.
 const reserve=g.registry.rules.ai.workers.reserve;
 for(const w of workers.slice(-reserve))w.unit!.order=null;
 g.observation.update();
 const action=choose().find(a=>a.type==='gather');
 expect(action).toMatchObject({type:'gather',target:root.id});
 if(action?.type==='gather')expect(action.actors).not.toContain(workers[0].id);
  expect(choose().some(a=>a.type==='gather')).toBe(false);
});
it('saves for an unlocked underrepresented Hunter instead of endlessly buying cheaper Warriors',()=>{
 const {g,mound,decide}=setup(true);mound.definition='building.test.great-mound';
 g.state.research['player.1']=Object.keys(g.registry.rules.research);
 for(let i=0;i<8;i++)g.context.create(placed(`mix-worker-${i}`,'unit.test.settler',210+i,225));
 for(let i=0;i<4;i++)g.context.create(placed(`archer-mix-${i}`,'unit.test.archer',212+i,219));
 const hunter=price(g.registry.get('unit.test.hunter').creation!.items),warrior=price(g.registry.get('unit.test.warrior').creation!.items);
 // Warriors are affordable, the Hunter is not yet.
 const saving={[AMBER]:hunter[AMBER]!-50,[WOOD]:100,[ROOT]:100};
 expect(saving[AMBER]).toBeGreaterThanOrEqual(warrior[AMBER]!);
 g.state.wallets[mound.owner]=saving;g.observation.update();
 expect(decide().some(a=>a.type==='produce')).toBe(false);
 g.state.wallets[mound.owner][AMBER]=hunter[AMBER]!;g.observation.update();
 expect(decide()[0]).toMatchObject({type:'produce',definition:'unit.test.hunter'});
});
it('still buys affordable emergency troops below the army floor',()=>{
 const {g,mound,decide}=setup();mound.definition='building.test.great-mound';
 g.state.research['player.1']=Object.keys(g.registry.rules.research);
 for(let i=0;i<8;i++)g.context.create(placed(`emergency-worker-${i}`,'unit.test.settler',210+i,225));
 const soldiers=g.entities.filter(e=>e.owner==='player.1'&&g.registry.get(e.definition).behaviors.combat&&!g.registry.get(e.definition).behaviors.work);
 for(const e of soldiers.slice(3))g.context.remove(e);
 g.state.wallets[mound.owner]={...price(g.registry.get('unit.test.warrior').creation!.items),[WOOD]:100,[ROOT]:100};g.observation.update();
 expect(decide()[0]).toMatchObject({type:'produce',definition:'unit.test.warrior'});
});
it('saves the declared level-based revival price before buying more recruits',()=>{
 const {g,mound,decide}=setup();
 const altar=g.context.create(placed('revival-altar','building.test.sanctuary',161.5,221.5));
 const hero=g.entities.find(e=>e.owner==='player.1'&&g.registry.get(e.definition).hero)!;
 hero.progression!.experience=g.registry.get(hero.definition).behaviors.progression!.levels[3].experience;
 const fee=price(revivalTerms(g.registry.get(altar.definition).behaviors.revival!,g.context.stats(hero).level).items)[AMBER]!;
 g.economy.remove(hero);g.revival.retain(hero);
 g.state.wallets[mound.owner]={[AMBER]:fee-1,[WOOD]:100};g.observation.update();
 const spending=new Set(['produce','build','upgrade','research','revive']);
 expect(decide().filter(a=>spending.has(a.type))).toEqual([]);
 g.state.wallets[mound.owner][AMBER]=fee;g.observation.update();
 const action=decide()[0];expect(action).toEqual({type:'revive',actor:altar.id,hero:hero.id});
 expect(g.command('player.1',action).accepted).toBe(true);expect(g.state.wallets[mound.owner][AMBER]??0).toBe(0);
});
it('can replace a critically depleted workforce while saving for hero recovery',()=>{
 const {g,mound,decide}=setup();g.context.create(placed('revival-altar','building.test.sanctuary',161.5,221.5));
 const hero=g.entities.find(e=>e.owner==='player.1'&&g.registry.get(e.definition).hero)!;
 g.economy.remove(hero);g.revival.retain(hero);
 const workers=g.entities.filter(e=>e.owner==='player.1'&&g.registry.get(e.definition).behaviors.work);
 for(const w of workers.slice(1))g.economy.remove(w);
 g.state.wallets[mound.owner]={...price(g.registry.get('unit.test.settler').creation!.items),[WOOD]:0};g.observation.update();
 const action=decide()[0];expect(action).toEqual({type:'produce',actor:mound.id,definition:'unit.test.settler'});
 expect(g.command('player.1',action).accepted).toBe(true);
});
