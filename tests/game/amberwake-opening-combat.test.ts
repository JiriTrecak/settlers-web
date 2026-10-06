import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {content} from '../../src/content/builtin';
import {parseUtcMap} from '../../src/shared/map/utcmap';
import {Game} from '../../src/sim/game/game';
import {precise} from '../../src/sim/game/motion';
import {slots} from './helpers';

it('joins the first camp fight around an attacking ally from both starts, including cold replay',()=>{
 const source=parseUtcMap(JSON.parse(readFileSync('assets/maps/skirmish/amberwake-basin.utcmap','utf8')))!;
 const map={...source,entities:[...source.entities]};
 for(const side of [1,2] as const)map.entities.push({id:`opening.${side}`,definition:'unit.ants.warrior',owner:`player.${side}`,
  position:side===1?{x:105,y:404}:{x:406,y:107},rotation:side===1?0:180});
 const make=()=>new Game(map,slots,content,6401),g=make();
 const sides=[1,2].map(side=>{
  const actors=g.entities.filter(e=>e.owner===`player.${side}`&&(content.get(e.definition).hero||e.placement===`opening.${side}`));
  const camp=map.camps.find(c=>c.id===`camp/foragers.${side}`)!;
  expect(g.command(`player.${side}`,{type:'move',actors:actors.map(e=>e.id),destination:camp.home,attackMove:true}).accepted).toBe(true);
  return {actors,camp,joined:0,cleared:0,health:[] as number[]};
 });
 let restored:Game|undefined;
 for(let tick=1;tick<=1800;tick++){
  g.tick();restored?.tick();
  // Snapshot while the hero is approaching a front-line ally, not after combat.
  if(tick===300){restored=make();restored.restore(JSON.parse(JSON.stringify(g.snapshot())));}
  for(const side of sides){
   if(!side.joined&&side.actors.some(e=>content.get(e.definition).hero&&e.unit?.attack?.released))side.joined=tick;
   if(!side.cleared&&g.state.clearedCamps.includes(side.camp.id)){
    side.cleared=tick;side.health=side.actors.map(e=>e.hp!);
   }
  }
  if(restored&&tick%40===0)expect(restored.checksum('full')).toBe(g.checksum('full'));
 }
 for(const side of sides){
  expect(side.joined).toBeGreaterThan(0);expect(side.joined).toBeLessThan(400);
  expect(side.cleared).toBeGreaterThan(0);expect(side.cleared).toBeLessThan(1200);
  expect(side.health.every(hp=>hp>0)).toBe(true);
  // Do not hide post-combat arrival bugs by issuing Stop/Hold on camp clear.
  for(const actor of side.actors){
   expect(actor.unit!.order).toBeNull();expect(actor.unit!.route).toHaveLength(0);
   const p=precise(actor);expect(Math.hypot(p.x-side.camp.home.x,p.y-side.camp.home.y)).toBeLessThan(8);
  }
 }
 expect(Math.abs(sides[0].cleared-sides[1].cleared)).toBeLessThan(40);
 expect(sides[0].health).toEqual(sides[1].health);
 expect(restored!.snapshot()).toEqual(g.snapshot());
},30000);
