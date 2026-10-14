import {expect,it,vi} from 'vitest';
import {Game} from '../../src/sim/game/game';
import {footprintCellBounds} from '../../src/shared/spatial/footprint';
import {snapPlacement} from '../../src/shared/spatial/placement';
import {foundationTerrainFits} from '../../src/shared/spatial/foundation';
import {emptyUtcMap,type UtcMap} from '../../src/shared/map/utcmap';
import {HeightField} from '../../src/shared/map/height';
import {captureTerrain} from '../../src/shared/authoring/captureTerrain';
import {testContent} from '../fixtures/content';
import {createMapBriefing} from '../../src/sim/ai/briefing';
import {Frame,Geography} from '../../src/sim/ai/frame';

/** A synthetic map whose whole surface undulates gently: every foundation sees some relief, but no ledge. */
function rollingMap():UtcMap{
 const map=emptyUtcMap(),field=new HeightField(map.size);field.waterLevel=-5;
 for(let z=0;z<field.verts;z++)for(let x=0;x<field.verts;x++)
  field.samples[z*field.verts+x]=1.2*Math.sin((x+field.origin)/6)*Math.cos((z+field.origin)/7);
 return {...map,authoring:{version:1,objects:[],terrain:captureTerrain(field)}};
}

it('allows the same real construction for player and AI on gently rolling base ground',()=>{
 const map=rollingMap();
 const slots=map.playerStarts.map((_,player)=>({player,kind:'human' as const}));
 const game=new Game(map,slots,testContent);vi.spyOn(game.observation,'explored').mockReturnValue(true);
 const geo=new Geography(createMapBriefing(map,game.registry));
 for(const start of map.playerStarts){
  const owner=`player.${start.player}` as const;
  const worker=game.entities.find(e=>e.owner===owner&&game.registry.get(e.definition).behaviors.work)!;
  const definition='building.test.house',d=game.registry.get(definition);
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
  const restored=new Game(map,slots,testContent);restored.restore(game.snapshot());vi.spyOn(restored.observation,'explored').mockReturnValue(true);
  const command={type:'build' as const,actors:[worker.id],definition,position:spot!};
  expect(game.command(owner,command).accepted).toBe(true);
  expect(restored.command(owner,command).accepted).toBe(true);
  expect(game.checksum()).toBe(restored.checksum());
 }
},60000);
