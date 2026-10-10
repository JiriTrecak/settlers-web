import {readFileSync} from 'node:fs';
import {expect,it,vi} from 'vitest';
import {Game} from '../../src/sim/game/game';
import {footprintCellBounds} from '../../src/shared/spatial/footprint';
import {snapPlacement} from '../../src/shared/spatial/placement';
import {foundationTerrainFits} from '../../src/shared/spatial/foundation';
import {type UtcMap} from '../../src/shared/map/utcmap';
import {createMapBriefing} from '../../src/sim/ai/briefing';
import {Frame,Geography} from '../../src/sim/ai/frame';

it.each(['echo-isles','turtle-rock'])('%s allows real construction on gently rolling base ground',name=>{
 const map=JSON.parse(readFileSync(`assets/maps/skirmish/${name}.utcmap`,'utf8')) as UtcMap;
 const slots=map.playerStarts.map((_,player)=>({player,kind:'human' as const}));
 const game=new Game(map,slots);vi.spyOn(game.observation,'explored').mockReturnValue(true);
 const geo=new Geography(createMapBriefing(map,game.registry));
 for(const start of map.playerStarts){
  const owner=`player.${start.player}` as const;
  const worker=game.entities.find(e=>e.owner===owner&&game.registry.get(e.definition).behaviors.work)!;
  const definition='building.ants.house',d=game.registry.get(definition);
  const view=game.view(owner);view.fog={...view.fog!,cells:new Uint8Array(map.size**2).fill(2)};
  const ai=new Frame(view,owner,game.registry,geo,game.state.tick);
  let spot:{x:number;y:number}|undefined;
  for(let dy=-36;dy<=36&&!spot;dy+=4)for(let dx=-36;dx<=36&&!spot;dx+=4){
   const p=snapPlacement(d,{x:start.x+dx,y:start.z+dy}),cells=game.spatial.footprint({definition,...p,rotation:0});
   const hs=cells.map(i=>game.spatial.heights[i]);
   if(Math.max(...hs)-Math.min(...hs)<=50)continue;
   if(game.canBuild(owner,definition,p,worker.id)===null&&ai.placeable(d,p,0))spot=p;
  }
  expect(spot,`player ${start.player} has a shared player/AI build site previously rejected as uneven`).toBeDefined();
  expect(foundationTerrainFits(footprintCellBounds(spot!,d.footprint),(x,y)=>game.spatial.heights[y*map.size+x])).toBe(true);
  const restored=new Game(map,slots);restored.restore(game.snapshot());vi.spyOn(restored.observation,'explored').mockReturnValue(true);
  const command={type:'build' as const,actors:[worker.id],definition,position:spot!};
  expect(game.command(owner,command).accepted).toBe(true);
  expect(restored.command(owner,command).accepted).toBe(true);
  expect(game.checksum()).toBe(restored.checksum());
 }
},60000);
