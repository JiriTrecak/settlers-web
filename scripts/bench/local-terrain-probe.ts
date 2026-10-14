import {LocalTerrainSweeps} from '../../src/sim/game/localTerrainSweeps';
/** Diagnostic only: delegate every query, recording whether current cache keys
 * can represent the actual local-search steps. Never an acceptance timing run. */
export function probeLocalTerrain(){
 const clear=LocalTerrainSweeps.prototype.clear;
 const counts={queries:0,quarterAdjacent:0,largerAligned:0,arbitrary:0,steps:{} as Record<string,number>};
 LocalTerrainSweeps.prototype.clear=function(from,to){
  counts.queries++;
  const dx=(to.x-from.x)/250,dy=(to.y-from.y)/250;
  const aligned=!from.surface&&!to.surface&&Number.isInteger(from.x/250)&&Number.isInteger(from.y/250)&&Number.isInteger(dx)&&Number.isInteger(dy);
  const length=Math.max(Math.abs(dx),Math.abs(dy));
  if(aligned&&length<=1)counts.quarterAdjacent++;
  else if(aligned&&length<=8&&(dx===0||dy===0||Math.abs(dx)===Math.abs(dy)))counts.largerAligned++;
  else counts.arbitrary++;
  const key=aligned?`${Math.min(99,length)} quarter cells`:'off grid';counts.steps[key]=(counts.steps[key]??0)+1;
  return clear.call(this,from,to);
 };
 return counts;
}
