import {expect,it} from 'vitest';
import {matchResult} from '../../src/presentation/matchResult';
import type {Slot} from '../../src/shared/match/match';

const slots:Slot[]=[{player:0,kind:'human',name:'Oak'},{player:1,kind:'human',name:'Ash'}];
it('shows opposite results to the winner and loser of the same match',()=>{
  const outcome={winner:'player.2' as const,defeated:['player.1' as const]};
  expect(matchResult(outcome,1,slots).title).toBe('Victory');
  expect(matchResult(outcome,0,slots).title).toBe('Defeat');
});
it('awards victory to the winning team, including an eliminated teammate',()=>{
  const teams=slots.map(slot=>({...slot,team:4}));
  expect(matchResult({winner:'player.2',defeated:['player.1']},0,teams).kind).toBe('victory');
});
it('supports team zero and does not treat unteamed opponents as allies',()=>{
  expect(matchResult({winner:'player.2',defeated:[]},0,slots.map(s=>({...s,team:0}))).kind).toBe('victory');
  expect(matchResult({winner:'player.2',defeated:[]},0,slots).kind).toBe('defeat');
});
it('handles draws and spectator results without a false defeat',()=>{
  expect(matchResult({winner:null,defeated:['player.1','player.2']},0,slots).kind).toBe('draw');
  expect(matchResult({winner:'player.2',defeated:['player.1']},null,slots)).toEqual({kind:'observer',title:'Match complete',description:"Ash's side wins the match."});
});
