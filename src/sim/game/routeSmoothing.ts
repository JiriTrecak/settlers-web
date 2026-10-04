/** Advance along a route using a logarithmic number of full clearance queries.
 * start is already known clear. Visibility need not be monotonic: the result is
 * always an explicitly tested endpoint, never an inferred traversable segment.
 */
export function farthestClearWaypoint(start:number,end:number,clear:(index:number)=>boolean):number {
 let farthest=start;
 for(let stride=1;farthest<end;stride*=2){
  const probe=Math.min(end,start+stride);
  if(clear(probe)){farthest=probe;continue;}
  // An occluded midpoint may hide later clear candidates. Missing that
  // shortcut is safe; accepting an unchecked one is not. The already checked
  // adjacent waypoint remains the fallback.
  let low=farthest+1,high=probe-1;
  while(low<=high){
   const mid=Math.floor((low+high)/2);
   if(clear(mid)){farthest=mid;low=mid+1;}else high=mid-1;
  }
  break;
 }
 return farthest;
}
