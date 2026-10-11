type Start={player:number;x:number;z:number};
type Mine={index:number;x:number;y:number};
/** One source mine per main. Stable distance ordering prevents two neighbouring
 * deposits from being collapsed into the same five-node service layout. */
export function startingMines(starts:readonly Start[],mines:readonly Mine[],radius:number):Map<number,Start>{
 const candidates=starts.flatMap(start=>mines.map(mine=>({start,mine,distance:Math.hypot(start.x-mine.x,start.z-mine.y)}))).filter(pair=>pair.distance<=radius);
 candidates.sort((a,b)=>a.distance-b.distance||a.start.player-b.start.player||a.mine.index-b.mine.index);
 const assigned=new Map<number,Start>(),players=new Set<number>();
 for(const {start,mine} of candidates){
  if(assigned.has(mine.index)||players.has(start.player))continue;
  assigned.set(mine.index,start);players.add(start.player);
 }
 return assigned;
}
