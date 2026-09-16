import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
import {Game} from '../../src/sim/game/game';
import {parseUtcMap} from '../../src/shared/map/utcmap';
import {playableMapError} from '../../src/shared/map/playable';
import {precise,fixed} from '../../src/sim/game/motion';
const map=()=>parseUtcMap(JSON.parse(readFileSync('assets/maps/campaign/vanguard-heartwood-vault.utcmap','utf8')))!;
it('keeps every camp spawn reachable around the fungal groves and resin wellspring',()=>{
 const m=map(),g=new Game(m,[{player:0,kind:'human'}]),s=g.spatial;
 const hero=g.entities.find(e=>e.placement==='marshal')!;
 for(const e of g.entities.filter(e=>e.unit)){
  expect(s.walkable(s.cell(e)),e.placement??String(e.id)).toBe(true);
  expect(s.findPath(s.cell(hero),s.cell(e)),e.placement??String(e.id)).not.toBeNull();
 }
 for(const id of ['vault-fungal-grove','vault-fungal-nursery','vault-wellspring']){
  const p=m.stamps.find(s=>s.id===id)!;
  expect(s.walkable(s.cell({x:Math.round(p.x),y:Math.round(p.y)})),id+' blocks its solid base').toBe(false);
 }
});
it('connects every indoor objective, the root crown and a distinct passage below it',()=>{
 const m=map();expect(playableMapError(m)).toBeNull();
 const g=new Game(m,[{player:0,kind:'human'}]),s=g.spatial,hero=g.entities.find(e=>e.placement==='marshal')!;
 for(const r of m.mission!.regions)expect(s.findPath(s.cell(hero),s.cell({x:r.x,y:r.y})),r.id).not.toBeNull();
 const crown=s.findPath(s.cell(hero),s.cell({x:130,y:145,surface:'vault-root'}))!;
 expect(crown.some(i=>s.point(i).surface==='vault-root')).toBe(true);
 const lower=s.findPath(s.cell({x:115,y:143}),s.cell({x:145,y:143}))!;
 expect(lower.length).toBeGreaterThan(0);expect(lower.every(i=>!s.point(i).surface)).toBe(true);
});
it('takes all eight ants from the entrance to the lower gallery',()=>{
 const g=new Game(map(),[{player:0,kind:'human'}]),army=g.entities.filter(e=>e.owner==='player.1'&&e.unit);
 g.command('player.1',{type:'move',actors:army.map(e=>e.id),destination:{x:120,y:143}});
 for(let i=0;i<1100;i++){g.state.mission!.dialogue=null;g.tick();}
 for(const e of army){expect(e.hp,e.placement??undefined).toBeGreaterThan(0);expect(Math.hypot(precise(e).x-120,precise(e).y-143),e.placement??undefined).toBeLessThan(8);}
});
it('advances indoor stages, restores a deterministic save and awards victory after every final guard is defeated',()=>{
 const g=new Game(map(),[{player:0,kind:'human'}]);
 const advance=()=>{for(let i=0;i<8;i++){g.state.mission!.dialogue=null;g.tick();}expect(g.state.mission?.error).toBeNull();};
 advance();const hero=g.entities.find(e=>e.placement==='marshal')!;
 hero.x=120;hero.y=143;hero.unit!.position=fixed(hero);g.spatial.rebuild();advance();expect(g.state.mission?.variables.stage).toBe('resin');
 const copy=new Game(map(),[{player:0,kind:'human'}]);copy.restore(g.snapshot());g.tick();copy.tick();expect(copy.checksum()).toBe(g.checksum());
 for(const id of ['resin-guard.0','resin-guard.1'])g.entities.find(e=>e.placement===id)!.hp=0;
 advance();expect(g.state.mission?.variables.stage).toBe('heart');
 for(const id of ['heart-keeper.0','heart-keeper.1'])g.entities.find(e=>e.placement===id)!.hp=0;
 advance();expect(g.state.outcome).toBeNull();
 g.entities.find(e=>e.placement==='heart-keeper.2')!.hp=0;advance();expect(g.state.outcome?.winner).toBe('player.1');
});
