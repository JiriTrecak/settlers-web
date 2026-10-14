import {expect,it,vi} from 'vitest';
import {game,placed} from '../game/helpers';
import {Frame,Geography,ObservedBlockers} from '../../src/sim/ai/frame';
import {ObservedNavigation} from '../../src/sim/ai/observedNavigation';
import {createMapBriefing} from '../../src/sim/ai/briefing';
import {resourceBlocksCell} from '../../src/shared/map/resourceClearance';
import type {Bounds} from '../../src/shared/spatial/footprint';
import {SimulationProfiler} from '../../src/sim/profiling';

it('matches cell-by-cell resource buffers and exact entrance floods across observed changes',()=>{
 const g=game([placed('hall','building.ants.fort',129.5,129.5),placed('worker','unit.ants.settler',105,140),
  {...placed('resource','building.neutral.amber-mine',172.5,149.5),owner:'none'},placed('observer','unit.ants.settler',180,160),placed('other','building.ants.house',105.5,109.5)]);
 g.tick();
 const geo=new Geography(createMapBriefing(g.map,g.registry)),blockers=new ObservedBlockers(),profile=new SimulationProfiler();profile.enabled=true;
 let certified=0,accepted=0,rejected=0;
 for(let observation=0;observation<3;observation++){
  const view=g.view('player.1');
  view.fog={...view.fog!,cells:new Uint8Array(g.map.size*g.map.size).fill(2)};
  // New observations may move resources, deplete them, or remove buildings.
  const resource=view.entities.find(e=>e.definition==='building.neutral.amber-mine')!;
  expect(resource).toBeDefined();
  if(observation===1){resource.x-=8;resource.rotation=90;}
  if(observation===2){resource.resource!.amount=0;view.entities=view.entities.filter(e=>e.definition!=='building.ants.house');}
  const f=new Frame(view,'player.1',g.registry,geo,g.state.tick+observation,blockers,profile);
  const privateFrame=f as unknown as {resourceClear:(bounds:Bounds)=>boolean};
  for(const rotation of [0,90,180,270])for(const [x,y] of [[155.5,131.5],[155.5,147.5],[163.5,147.5],[179.5,147.5],[147.5,131.5],[105.5,153.5]]){
   const d=g.registry.get('building.ants.house'),p={x,y};
   profile.reset();const actual=f.placeable(d,p,rotation);
   const work=profile.workSnapshot(),expanded=work.filter(r=>r.path.endsWith('Approach cells expanded')).reduce((n,r)=>n+r.value,0);
   certified+=work.filter(r=>r.path.endsWith('Placement sweeps certified clear')).reduce((n,r)=>n+r.value,0);
   actual?accepted++:rejected++;
   const proof=vi.spyOn(ObservedNavigation.prototype,'provesGroundSweep').mockReturnValue(false);
   const clearance=vi.spyOn(privateFrame,'resourceClear').mockImplementation(bounds=>{
    for(const res of f.resources){
     const definition=f.def(res),padding=definition.constructionClearance;if(padding===undefined)continue;
     for(let yy=bounds.minY;yy<=bounds.maxY;yy++)for(let xx=bounds.minX;xx<=bounds.maxX;xx++)
      if(resourceBlocksCell({x:xx,y:yy},res,definition.footprint,padding,res.rotation))return false;
    }
    return true;
   });
   try{
    profile.reset();expect(f.placeable(d,p,rotation)).toBe(actual);
    expect(profile.workSnapshot().filter(r=>r.path.endsWith('Approach cells expanded')).reduce((n,r)=>n+r.value,0)).toBe(expanded);
   }finally{proof.mockRestore();clearance.mockRestore();}
  }
 }
 expect(certified).toBeGreaterThan(0);expect(accepted).toBeGreaterThan(0);expect(rejected).toBeGreaterThan(0);
});
