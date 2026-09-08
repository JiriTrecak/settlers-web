import { decodeHeight, HeightField } from './height';
import { MAP_SIZE } from './map';
import type { PlayerStart, UtcMap } from './utcmap';
import { RULES_REVISION } from '../settlement/rules';

export type PlayableMap = UtcMap & { readonly playerStarts: readonly PlayerStart[] };
/** Validate at authoring/import boundaries, never during simulation ticks. */
export function playableMapError(map: UtcMap): string | null {
  const starts = map.playerStarts ?? [];
  if (!starts.some(s=>s.player===1)||!starts.some(s=>s.player===2)) return 'Place Player 1 and Player 2 start points.';
  if(starts.some((_,i)=>!starts.some(s=>s.player===i+1))) return "Player slots must be consecutive, starting at Player 1.";
  const field=new HeightField();
  if(map.height) field.load(decodeHeight(map.height) ?? [], map.waterLevel ?? 0);
  else field.waterLevel=map.waterLevel ?? 0;
  for(const s of starts){
    if(!Number.isInteger(s.x)||!Number.isInteger(s.z)||s.x<8||s.z<8||s.x>MAP_SIZE-9||s.z>MAP_SIZE-9) return `Player ${s.player} needs an integer start at least 8 cells inside the map.`;
    let lo=Infinity,hi=-Infinity;
    for(let z=s.z-5;z<=s.z+7;z++)for(let x=s.x-5;x<=s.x+5;x++){
      const h=field.sample(x,z);lo=Math.min(lo,h);hi=Math.max(hi,h);
    }
    if(lo<=field.waterLevel+.1) return `Player ${s.player} needs dry ground for the fort and workers.`;
    if(hi-lo>1) return `Player ${s.player} needs flatter ground for the fort and workers.`;
    if(starts.some(t=>t.player!==s.player&&Math.hypot(t.x-s.x,t.z-s.z)<20)) return 'Player starts must be at least 20 cells apart.';
  }
  if(new Set(starts.map(s=>s.player)).size!==starts.length) return 'Player starts must be unique.';
  return null;
}
export function requirePlayableMap(map: UtcMap): PlayableMap {
  const error=playableMapError(map);if(error)throw new Error(error);
  return map as PlayableMap;
}
export function mapRevision(map: UtcMap): string {
  const text=JSON.stringify(map);let hash=2166136261;
  for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);
  return `${RULES_REVISION}-${(hash>>>0).toString(16)}`;
}
