import {expect, it} from 'vitest';
import {game} from './helpers';
import {observerResources} from '../../src/presentation/observerStats';
it('uses the same declared amber, wood, root ordering for player and observer summaries',()=>{
  const g = game();
  expect(g.view('player.1').goods?.map(row=>row.item)).toEqual(['item.amber','item.wood','item.root']);
  expect(observerResources(g.registry).map(row=>row.item)).toEqual(['item.amber','item.wood','item.root']);
});
it('reports rejected commands as errors rather than ordinary announcements',()=>{
  const g = game();
  const result = g.command('player.1',{type:'learnAbility',actor:999999,ability:'missing'});
  expect(result.accepted).toBe(false);
  expect(g.state.facts.at(-1)).toMatchObject({type:'error',owner:'player.1'});
});
