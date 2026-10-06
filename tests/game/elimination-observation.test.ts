import {expect,it} from 'vitest';
import {ContentRegistry} from '../../src/content/registry';
import type {Rules} from '../../src/content/schema';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {Game} from '../../src/sim/game/game';
import {source} from './helpers';

it('keeps four-player elimination, subsequent knowledge and restored play identical to a full refresh',()=>{
 const draft=source();(draft.rules as Rules).startingSetup.gathering=[];
 const registry=new ContentRegistry(draft),map={...emptyUtcMap(),playerStarts:[1,2,3,4].map(player=>({
  player,x:player%2?37.5:217.5,z:player<3?37.5:217.5,setup:'setup.ants',mainFort:`start.player.${player}/main-fort`,
 }))};
 const slots=[0,1,2,3].map(player=>({player,kind:'human' as const,team:player}));
 const game=new Game(map,slots,registry),reference=new Game(map,slots,registry);
 reference.spatial.refreshAfterRemoval=()=>reference.spatial.rebuild();
 const kill=(g:Game,owner:'player.1'|'player.2'|'player.3')=>{g.context.get(g.state.objectives[owner])!.hp=0;};
 kill(game,'player.1');kill(reference,'player.1');
 for(let i=0;i<24;i++){
  if(i===8){kill(game,'player.2');kill(reference,'player.2');}
  if(i===16)game.restore(game.snapshot());
  game.tick();reference.tick();reference.observation.update();
  expect(game.snapshot()).toEqual(reference.snapshot());
  expect(game.checksum()).toBe(reference.checksum());
  for(const owner of ['player.1','player.2','player.3','player.4'] as const){
   const actual=game.view(owner),expected=reference.view(owner);
   // Revision is a presentation invalidation token, not authored knowledge.
   expect({...actual,revision:0,fog:actual.fog&&{...actual.fog,revision:0}})
    .toEqual({...expected,revision:0,fog:expected.fog&&{...expected.fog,revision:0}});
  }
  expect(game.state.outcome).toBeNull();
  expect(game.entities.some(e=>e.owner==='player.1')).toBe(false);
 }
 expect(game.state.facts.filter(f=>f.message==='Colony defeated')).toHaveLength(2);
 kill(game,'player.3');game.tick();
 expect(game.view('player.4').outcome).toMatchObject({winner:'player.4',defeated:['player.1','player.2','player.3']});
});
