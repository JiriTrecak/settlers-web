import {expect,it} from 'vitest';
import {game,placed} from './helpers';
import {routeToAttack} from '../../src/sim/game/attackApproach';

/** Approach geometry may be reused across retries, but never once its inputs change: after every invalidating event the
 * cached game must choose exactly what a game without any retained approach geometry chooses. */
it('reuses approach geometry only while blockers, target, attacker and terrain are unchanged',()=>{
 const placements=[placed('one','unit.test.archer',100,110),{...placed('enemy','unit.test.warrior',140,110),owner:'player.2' as const}];
 const cached=game(placements),fresh=game(placements);
 const pick=(g:typeof cached)=>({actor:g.entities.find(e=>e.placement==='one')!,target:g.entities.find(e=>e.placement==='enemy')!});
 const check=()=>{
  fresh.spatial.approachPositions.clear();
  const a=pick(cached),b=pick(fresh);
  expect(routeToAttack(cached.context,a.actor,a.target)).toBe(routeToAttack(fresh.context,b.actor,b.target));
  expect(a.actor.unit).toEqual(b.actor.unit);
 };
 const both=(change:(g:typeof cached)=>void)=>{change(cached);change(fresh);check();};
 check();
 both(g=>{g.state.tick+=6;});
 both(g=>{g.context.create(placed('moving-body','unit.test.warrior',103,110));});
 both(g=>{g.spatial.appendOccupancy(g.context.create(placed('distant','building.test.house',220,220)));});
 both(g=>{g.spatial.appendOccupancy(g.context.create(placed('nearby','building.test.house',130,110)));});
 both(g=>{const e=g.entities.find(e=>e.placement==='nearby')!;g.context.remove(e);g.spatial.refreshAfterRemoval(e.id);});
 both(g=>{pick(g).target.x++;});
 both(g=>{pick(g).actor.definition='unit.test.warrior';});
 both(g=>{g.spatial.terrain[115*g.spatial.size+130]=0;g.spatial.rebuild();});
 check();
});
