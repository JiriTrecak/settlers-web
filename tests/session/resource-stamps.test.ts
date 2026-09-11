import {ResourceScenery} from '../../src/presentation/scenery';
import {expect,it,vi} from 'vitest';
import {Session} from '../../src/session/session/session';
import {Game} from '../../src/sim/game/game';
import {emptyUtcMap} from '../../src/shared/map/utcmap';

it('reuses unchanged observations but removes falling trees and refreshes same-tick view changes',()=>{
 const game=new Game(emptyUtcMap(),[{player:0,kind:'human'},{player:1,kind:'human'}]);
 const tree=game.context.create({id:'tree',definition:'resource.forest.tree',owner:'none',position:{x:100,y:100},rotation:0});
 game.observation.update();
 const session=Object.assign(Object.create(Session.prototype),{loadedMap:{map:{stamps:[]}},mini:{setStamps:vi.fn()},resourceScenery:new ResourceScenery()});
 const entities=game.view().entities;
 session.updateResourceStamps(entities);
 expect(session.stamps.some((s:{id:string})=>s.id===`resource-${tree.id}`)).toBe(true);
 const original=session.stamps;
 session.updateResourceStamps(entities);
 expect(session.stamps).toBe(original);expect(session.mini.setStamps).toHaveBeenCalledTimes(1);
 // Fog/debug perspective may change without a simulation tick advancing.
 session.updateResourceStamps([]);
 expect(session.stamps).toEqual([]);
 session.updateResourceStamps(entities);
 expect(session.stamps.some((s:{id:string})=>s.id===`resource-${tree.id}`)).toBe(true);
 tree.resource!.felling!.lastHitTick=game.state.tick;
 game.observation.update();session.updateResourceStamps(game.view().entities);
 expect(session.stamps).toEqual([]);
 // Restored/authored map stamps invalidate the projection independently of trees.
 session.loadedMap.map.stamps=[{id:'new-map-prop'}];
 session.updateResourceStamps(game.view().entities);
 expect(session.stamps).toEqual([{id:'new-map-prop'}]);
});
