import gameSource from '../../../content/game.json' with {type:'json'};
import {rulesSchema,type Rules} from '../../content/schema';
import {raceDefinition} from '../../content/races';
import {localMatch,type MatchConfig} from '../match/match';
import type {UtcMap} from '../map/utcmap';
const defaults=rulesSchema.parse(gameSource.rules);
/** Campaign race metadata follows participants; authored armies and script control stay authoritative. */
export function createMissionMatch(mapId:string,map:UtcMap,revision:string,rules:Rules=defaults):MatchConfig {
  if(!map.mission || !map.playerStarts.some(s=>s.player===1))throw new Error('A campaign mission requires Player 1');
  const mission=map.mission,base=mission.race??rules.campaigns[mission.campaign]?.race??rules.defaultRace;
  raceDefinition(rules,base);
  for(const [owner,race] of Object.entries(mission.playerRaces??{})) {
    if(!map.playerStarts.some(s=>`player.${s.player}`===owner))throw Error(`Mission race assigned to missing participant ${owner}`);
    raceDefinition(rules,race);
  }
  return {...localMatch({mapId,mapRevision:revision,seed:73841,slotCount:1,me:0}),slots:map.playerStarts.map(s=>({player:s.player-1,kind:'human',race:mission.playerRaces?.[`player.${s.player}`]??base,name:s.player===1?'Vanguard':`Scenario ${s.player}`}))};
}
