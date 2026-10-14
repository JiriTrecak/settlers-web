import {expect, it} from 'vitest';
import {game} from './helpers';
import {observerResources} from '../../src/presentation/observerStats';
it('uses the same declared currency ordering for player and observer summaries',()=>{
  const g = game();
  const currencies = g.registry.definitions.filter(d=>d.currency);
  const declared = [...currencies].sort((a,b)=>a.displayOrder!-b.displayOrder!).map(d=>d.id);
  expect(currencies.every(d=>d.displayOrder!==undefined)).toBe(true);
  // The fixture lists currencies out of display order, so this checks sorting rather than file order.
  expect(currencies.map(d=>d.id)).not.toEqual(declared);
  expect(g.view('player.1').goods?.map(row=>row.item)).toEqual(declared);
  expect(observerResources(g.registry).map(row=>row.item)).toEqual(declared);
});
it('reports rejected commands as errors rather than ordinary announcements',()=>{
  const g = game();
  const result = g.command('player.1',{type:'learnAbility',actor:999999,ability:'missing'});
  expect(result.accepted).toBe(false);
  expect(g.state.facts.at(-1)).toMatchObject({type:'error',owner:'player.1'});
});
