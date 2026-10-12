import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {readWarcraftMap} from '../../src/editor/import/warcraft/read';
import {convertWarcraftMap} from '../../src/editor/import/warcraft/convert';
import {content} from '../../src/content/builtin';
import {playableMapError} from '../../src/shared/map/playable';
import {Game} from '../../src/sim/game/game';
import {readUtcMap} from '../../src/shared/map/utcmap';

it.each(['echo-isles','turtle-rock'].flatMap(name=>['import','published'].map(source=>({name,source}))))('preserves the starting economy and clearance in $name ($source)',({name,source})=>{
 const loaded=source==='import'
  ?convertWarcraftMap(readWarcraftMap(new Uint8Array(readFileSync(`tests/editor/fixtures/warcraft/${name}.w3x`))))
  :readUtcMap(JSON.parse(readFileSync(`assets/maps/skirmish/${name}.utcmap`,'utf8')));
 if(!('map' in loaded))throw Error(`Invalid published ${name}`);
 const {map}=loaded;
 expect(map.size).toBe(640);
 expect(map.authoring.terrain.textureGrid).toEqual({cellSize:5,origin:[-.5,-.5]});
 expect(playableMapError(map)).toBeNull();
 for(const race of ['ants','beetles']){
  const slots=map.playerStarts.map((_,player)=>({player,kind:'human' as const,race}));
  const g=new Game(map,slots),replica=new Game(map,slots);
  for(const start of map.playerStarts){
   const owner=`player.${start.player}` as const,hall=g.context.get(g.state.objectives[owner])!;
   const nodes=map.entities.filter(e=>e.definition==='building.neutral.amber-mine'&&Math.hypot(e.position.x-start.x,e.position.y-start.z)<40);
   expect(nodes).toHaveLength(5);expect(nodes.reduce((n,e)=>n+e.position.x,0)/5).toBe(start.x);
   expect(nodes.map(e=>Math.abs(e.position.y-start.z)).sort()).toEqual([24,24,28,28,28]);
   const workers=g.entities.filter(e=>e.owner===owner&&content.get(e.definition).behaviors.work);
   expect(workers).toHaveLength(5);expect(workers.every(w=>g.spatial.unitWalkable(w,w))).toBe(true);
   expect(g.view(owner).entities.find(e=>e.id===hall.id)?.baseGathering).toEqual({workers:5,recommendedWorkers:10});
   for(const node of nodes){
    const target=g.entities.find(e=>e.placement===node.id)!,worker=workers[0];
    const approaches=[1,2,3].flatMap(r=>g.spatial.perimeter(target,r));
    expect(approaches.some(p=>g.spatial.unitWalkable(p,worker)&&g.spatial.attackClear(p,target,false)&&g.spatial.findPath(g.spatial.cell(worker),g.spatial.cell(p),undefined,Infinity,worker)!==null),node.id).toBe(true);
   }
  }
  for(let tick=0;tick<80;tick++){g.tick();replica.tick();if(tick%20===0)expect(replica.checksum('full')).toBe(g.checksum('full'));}
  const restored=new Game(map,slots);restored.restore(g.snapshot());
  for(let tick=0;tick<20;tick++){g.tick();restored.tick();}
  expect(restored.checksum('full')).toBe(g.checksum('full'));
 }
},120000);
