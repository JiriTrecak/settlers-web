import {expect,it} from 'vitest';
import {testContent as content} from '../fixtures/content';
import {expandMap} from '../../src/content/map';
import {startingFormationRotation} from '../../src/content/startingHero';
import {raceDefinition} from '../../src/content/races';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {Game} from '../../src/sim/game/game';
import {placed,slots} from './helpers';
const pattern=[[-8,24],[-4,28],[0,28],[4,28],[8,24]];
const directions=[[0,1],[1,0],[0,-1],[-1,0]];
const mineDefinition='building.test.neutral-amber-mine';
for(const race of ['alpha','beta'])for(const hallRotation of [0,90,180,270] as const){
 it(`${race} hall facing ${hallRotation}: workers face each deposit and hero starts opposite`,()=>{
  for(const [dx,dz] of directions){
   const blank=emptyUtcMap(512),starts=blank.playerStarts.map((s,i)=>({...s,x:i?401.5:81.5,z:i?401.5:81.5,rotation:hallRotation}));
   const entities=starts.flatMap(s=>pattern.map(([lateral,forward],i)=>({...placed(`mine.${s.player}.${i}`,mineDefinition,s.x+forward*dx+lateral*dz,s.z+forward*dz-lateral*dx),owner:'none' as const})));
   const map={...blank,playerStarts:starts,entities},players=slots.map(s=>({...s,race})),g=new Game(map,players,content);
   const setup=raceDefinition(content.rules,race).startingSetup,crew=setup.units.filter(u=>content.get(u.definition).behaviors.work).length;
   expect(expandMap({...map,entities:[...entities].reverse()},content,players)).toEqual(expandMap(map,content,players));
   for(const s of starts){
    const owner=`player.${s.player}` as const,hall=g.context.get(g.state.objectives[owner])!;
    const workers=g.entities.filter(e=>e.owner===owner&&content.get(e.definition).behaviors.work);
    const hero=g.entities.find(e=>e.owner===owner&&content.get(e.definition).hero)!;
    const side=(e:{x:number;y:number})=>(e.x-s.x)*dx+(e.y-s.z)*dz;
    expect(hall.rotation).toBe(hallRotation);expect(workers).toHaveLength(crew);
    expect(workers.every(w=>side(w)>0)).toBe(true);expect(side(hero)).toBeLessThan(0);
    expect(new Set(workers.map(w=>side(w))).size).toBe(1);
    expect(new Set(workers.map(w=>w.unit!.order?.type==='gather'?w.unit!.order.target:null)).size).toBe(Math.min(crew,pattern.length));
    expect(workers.every(w=>w.unit!.order?.type==='gather')).toBe(true);
    for(const actor of [...workers,hero])expect(g.spatial.unitWalkable(actor,actor)).toBe(true);
    expect(g.view(owner).entities.find(e=>e.id===hall.id)?.baseGathering).toEqual({workers:crew,recommendedWorkers:pattern.length*content.get(mineDefinition).harvesting!.recommendedWorkers});
   }
  }
 });
}
it('uses authored facing when no active nearby deposit exists',()=>{
 const start={x:81.5,z:81.5,rotation:270},setup=raceDefinition(content.rules,'alpha').startingSetup;
 const mine={...placed('mine',mineDefinition,81.5,105.5),owner:'none' as const};
 expect(startingFormationRotation(start,setup,[mine],content)).toBe(0);
 for(const resources of [[],[{...mine,initialState:{amount:0}}],[{...mine,activation:'script' as const}],[{...mine,position:{x:200,y:200}}]])
  expect(startingFormationRotation(start,setup,resources,content)).toBe(270);
});
