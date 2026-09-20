import {emptyUtcMap,type UtcMap} from '../../src/shared/map/utcmap';
/** Minimal script harness with two actors; no campaign content or map assets. */
export function missionFixture(script='function on_start() mission.say("Marshal", "unit.ants.marshal", "Test dialogue", 20, true, "marshal") end'):UtcMap{
 const map=emptyUtcMap();
 return {...map,playerStarts:[map.playerStarts[0]!],entities:[
 {id:'marshal',definition:'unit.ants.marshal',position:{x:190,y:195},rotation:0,owner:'player.1'},
 {id:'vanguard-scout',definition:'unit.ants.archer',position:{x:192,y:195},rotation:0,owner:'player.1'}],
 mission:{campaign:'test',title:'Script harness',order:1,objectives:[],heroLevelCap:2,regions:[],script}};
}
