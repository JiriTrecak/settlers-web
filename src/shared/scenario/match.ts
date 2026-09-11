import {localMatch,type MatchConfig} from '../match/match';
import type {UtcMap} from '../map/utcmap';
/** Campaigns don't run skirmish economy AI. Other authored owners are script-controlled. */
export function createMissionMatch(mapId:string,map:UtcMap,revision:string):MatchConfig {
  if(!map.mission || !map.playerStarts.some(s=>s.player===1))throw new Error('A campaign mission requires Player 1');
  return {...localMatch({mapId,mapRevision:revision,seed:73841,slotCount:1,me:0}),slots:map.playerStarts.map(s=>({player:s.player-1,kind:'human',name:s.player===1?'Vanguard':`Scenario ${s.player}`}))};
}
