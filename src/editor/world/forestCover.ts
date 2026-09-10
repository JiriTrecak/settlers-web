import {sampleCurve,type CurvePoint,type CoverPatch} from '../../shared/landscape/curve';
/** Space patches by brush radius rather than pointer events; commit the stroke once. */
export function forestCoverStroke(points:readonly CurvePoint[],radius:number):CoverPatch[]{
 const result:CoverPatch[]=[];
 for(const p of sampleCurve(points,radius,Math.max(.5,radius*.5))){
  const previous=result.at(-1);
  if(previous&&Math.hypot(p.x-previous.x,p.z-previous.z)<Math.max(.5,p.radius*.8))continue;
  result.push({x:p.x,z:p.z,radius:p.radius,density:.85,flowers:.025,grassScale:.65,broadRatio:1,palette:'forest',seed:((Math.round(p.x*100)*73856093)^(Math.round(p.z*100)*19349663))>>>0});
 }
 return result;
}
