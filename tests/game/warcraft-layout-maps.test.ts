import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {parseUtcMap} from '../../src/shared/map/utcmap';
import {playableMapError} from '../../src/shared/map/playable';
import {content} from '../../src/content/builtin';
import {Game} from '../../src/sim/game/game';
import {World} from '../../src/sim/world/world';

// Editor-authored adaptations of the classic source files, rather than the later ladder revisions.
describe.each([
 {id:'echo-isles',mines:20,camps:16,starts:[[189.5,329.5],[805.5,329.5]]},
 {id:'last-refuge',mines:30,camps:20,starts:[[193.5,841.5],[833.5,241.5]]},
])('$id authored 1v1 layout',({id,mines,camps,starts})=>{
 const load=()=>parseUtcMap(JSON.parse(readFileSync(`assets/maps/skirmish/${id}.utcmap`,'utf8')))!;
 const slots=[{player:0,kind:'human' as const},{player:1,kind:'human' as const}];

 it('has legal starts, source-site counts and live dense woodland layers',()=>{
  const map=load();expect(playableMapError(map)).toBeNull();
  expect(map.size).toBe(1024);
  expect(map.playerStarts.map(s=>[s.x,s.z])).toEqual(starts);
  expect(map.entities.filter(e=>e.definition==='building.neutral.amber-mine')).toHaveLength(mines);
  expect(map.camps).toHaveLength(camps);
  expect(map.authoring?.layers.find(l=>l.id==='ref-forest')).toBeDefined();
  const g=new Game(map,slots,content,6401);
  for(const e of g.entities.filter(e=>e.unit))expect(g.spatial.unitWalkable(e,e),e.placement??String(e.id)).toBe(true);
 });

 it('connects both bases to every resource site and camp for a large ground unit',()=>{
  const map=load(),g=new Game(map,slots,content,6401),s=g.spatial;
  const body={definition:'unit.ants.bombardier'};
  const origins=map.playerStarts.map(p=>s.nearest({x:Math.round(p.x),y:Math.round(p.z)},24,undefined,body)!);
  const sites=[...map.entities.filter(e=>content.get(e.definition).yield).map(e=>e.position),...map.camps.map(c=>c.home)];
  for(const [index,site] of sites.entries()){
   // A neutral occupies its centre; a cliff-edge centre can also have a free
   // but disconnected adjacent cell. Check an actual reachable service/attack
   // approach rather than asking the unit to stand inside the site itself.
   for(const [side,origin] of origins.entries()){
    const target=s.nearest({x:Math.round(site.x),y:Math.round(site.y)},16,undefined,body,p=>s.findPath(s.cell(origin),s.cell(p),undefined,Infinity,body)!==null);
    expect(target,`${id} P${side+1} → site ${index}`).not.toBeNull();
   }
  }
 },120000);

 it('runs both AI openings and preserves an exact cold save continuation',()=>{
  const map=load(),aiSlots=slots.map(s=>({...s,kind:'ai' as const}));
  const world=new World({map,slots:aiSlots,seed:6401});
  for(let i=0;i<2400;i++)world.tick();
  for(const owner of ['player.1','player.2']){
   expect(world.settlement.entities.filter(e=>e.owner===owner&&e.unit).length).toBeGreaterThan(6);
   expect(world.settlement.entities.some(e=>e.owner===owner&&e.definition==='building.ants.barracks')).toBe(true);
   expect(world.settlement.state.jobs.some(j=>j.item==='item.wood'&&world.settlement.entities.find(e=>e.id===j.worker)?.owner===owner)).toBe(true);
  }
  const restored=new World({map,slots:aiSlots,seed:6401});
  restored.restore(JSON.parse(JSON.stringify(world.snapshot())));
  for(let i=0;i<120;i++){world.tick();restored.tick();}
  expect(restored.snapshot()).toEqual(world.snapshot());
 },120000);
});
