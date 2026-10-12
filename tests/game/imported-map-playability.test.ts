import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {readUtcMap} from '../../src/shared/map/utcmap';
import {playableMapError} from '../../src/shared/map/playable';
import {Game} from '../../src/sim/game/game';
it.each(['echo-isles','turtle-rock'])('%s published map has usable starts and a deterministic save continuation',name=>{
 const loaded=readUtcMap(JSON.parse(readFileSync(`assets/maps/skirmish/${name}.utcmap`,'utf8')));
 if(!('map' in loaded))throw Error(`Invalid published ${name}`);
 const {map}=loaded;
 expect(playableMapError(map)).toBeNull();
 const slots=map.playerStarts.map((_,player)=>({player,kind:'human' as const})),game=new Game(map,slots);
 for(const e of game.entities.filter(e=>e.unit))expect(game.spatial.unitWalkable(e,e),e.placement??undefined).toBe(true);
 const hero=game.entities.find(e=>e.owner==='player.1'&&e.unit)!;
 for(const camp of map.camps){
  const approaches=[0,3,6,9].flatMap(r=>Array.from({length:8},(_,i)=>({x:Math.round(camp.home.x+Math.cos(i*Math.PI/4)*r),y:Math.round(camp.home.y+Math.sin(i*Math.PI/4)*r)})));
  expect(approaches.some(p=>game.spatial.unitWalkable(p,hero)&&game.spatial.findPath(game.spatial.cell(hero),game.spatial.cell(p),undefined,Infinity,hero)!==null),camp.id).toBe(true);
 }
 for(let i=0;i<40;i++)game.tick();
 const copy=new Game(map,slots);copy.restore(JSON.parse(JSON.stringify(game.snapshot())));
 for(let i=0;i<40;i++){game.tick();copy.tick();}
 expect(copy.snapshot()).toEqual(game.snapshot());
},60000);
