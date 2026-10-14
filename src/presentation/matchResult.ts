import {ownerSlot} from '../content/schema';
import type {MatchConfig} from '../shared/match/match';
import type {SettlementView} from '../sim/game/observation';

export type MatchOutcome = NonNullable<SettlementView['outcome']>;
export type MatchResult = {kind:'victory'|'defeat'|'draw'|'observer';title:string;description:string};

/** A team's surviving representative is the simulation's winner, not necessarily this player. */
export function matchResult(outcome:MatchOutcome,player:number|null,slots:MatchConfig['slots']):MatchResult {
  if(outcome.winner===null)return {kind:'draw',title:'Draw',description:'The match ended without a winning side.'};
  const winner=ownerSlot(outcome.winner);
  const team=(id:number)=>slots.find(slot=>slot.player===id)?.team??id;
  if(player===null){
    const name=slots.find(slot=>slot.player===winner)?.name||`Player ${winner+1}`;
    return {kind:'observer',title:'Match complete',description:`${name}'s side wins the match.`};
  }
  return team(player)===team(winner)
    ? {kind:'victory',title:'Victory',description:'Your side has won the match.'}
    : {kind:'defeat',title:'Defeat',description:'Your side has been defeated.'};
}
