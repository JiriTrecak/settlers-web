import {SceneryComposition,sceneryChanges} from '../../src/presentation/sceneryChanges';
import {ResourceScenery,resourceStamps} from '../../src/presentation/scenery';
import {resourceSceneryChanged} from '../../src/presentation/resourceSceneryRevision';
import type {EntityView} from '../../src/sim/game/observation';
import {expect,it,vi} from 'vitest';
import {Session} from '../../src/session/session/session';
import {Game} from '../../src/sim/game/game';
import {emptyUtcMap} from '../../src/shared/map/utcmap';

it('reuses unchanged observations but removes falling trees and refreshes same-tick view changes',()=>{
 const game=new Game(emptyUtcMap(),[{player:0,kind:'human'},{player:1,kind:'human'}]);
 const tree=game.context.create({id:'tree',definition:'resource.forest.tree',owner:'none',position:{x:100,y:100},rotation:0});
 game.observation.update();
 const session=Object.assign(Object.create(Session.prototype),{loadedMap:{map:emptyUtcMap()},mini:{setStamps:vi.fn()},resourceScenery:new ResourceScenery(),sceneryComposition:new SceneryComposition()});
 const entities=game.view().entities;
 session.updateResourceStamps(entities);
 expect(session.stamps.some((s:{id:string})=>s.id===`resource-${tree.id}`)).toBe(true);
 const original=session.stamps;
 session.updateResourceStamps(entities);
 expect(session.stamps).toBe(original);expect(session.mini.setStamps).toHaveBeenCalledTimes(1);
 // Fog/debug perspective may change without a simulation tick advancing.
 session.updateResourceStamps([]);
 expect(session.stamps).toEqual([]);
 expect(sceneryChanges(original,session.stamps)?.removed).toEqual(original);
 session.updateResourceStamps(entities);
 expect(session.stamps.some((s:{id:string})=>s.id===`resource-${tree.id}`)).toBe(true);
 tree.resource!.felling!.lastHitTick=game.state.tick;
 game.observation.update();session.updateResourceStamps(game.view().entities);
 expect(session.stamps).toEqual([]);
 // Restored/authored map stamps invalidate the projection independently of trees.
 session.loadedMap.map={...session.loadedMap.map,stamps:[{id:'new-map-prop'}]};
 session.updateResourceStamps(game.view().entities);
 expect(session.stamps).toEqual([{id:'new-map-prop'}]);
});

it('keeps surviving resource stamps stable when resource observations change without changing appearance',()=>{
 const game=new Game(emptyUtcMap(),[{player:0,kind:'human'},{player:1,kind:'human'}]);
 const trees=['one','two'].map((id,i)=>game.context.create({id,definition:'resource.forest.tree',owner:'none',position:{x:100+i*5,y:100},rotation:0}));
 const scenery=new ResourceScenery(),compose=new SceneryComposition(),base:never[]=[];
 game.observation.update();const first=compose.compose(base,scenery.project(game.view().entities));
 trees[0].resource!.amount--;trees[1].resource!.felling!.lastHitTick=game.state.tick;game.observation.update();
 const second=compose.compose(base,scenery.project(game.view().entities)),changes=sceneryChanges(first,second)!;
 expect(changes.added).toEqual([]);expect(changes.removed.map(s=>s.id)).toEqual([`resource-${trees[1].id}`]);
 expect(second.find(s=>s.id===`resource-${trees[0].id}`)).toBe(first.find(s=>s.id===`resource-${trees[0].id}`));
});

it('only reuses decoded resource scenery when all stamp inputs remain equivalent',()=>{
 const base:EntityView={id:1,definition:'resource.forest.tree',owner:'none',x:20,y:30,rotation:0,hp:null,resource:{amount:500,growingUntil:null}};
 const variants:EntityView[]=[
  {...base,resource:{...base.resource!,amount:499}},
  {...base,resource:{...base.resource!,growingUntil:100}},
  {...base,resource:{...base.resource!,amount:0}},
  {...base,resource:{...base.resource!,felling:{hp:10,lastHitTick:1,fallTick:null,direction:{x:1,y:0}}}},
  {...base,x:21},{...base,y:31},{...base,rotation:90},
  {...base,appearance:{scale:2}},
 ];
 for(const changed of variants){
  if(!resourceSceneryChanged(base,changed))expect(resourceStamps([changed])).toEqual(resourceStamps([base]));
  else expect(resourceStamps([changed])).not.toEqual(resourceStamps([base]));
 }
 const bare={...base,resource:undefined};expect(resourceSceneryChanged(base,bare)).toBe(true);
 expect(resourceSceneryChanged(bare,base)).toBe(true);
});
