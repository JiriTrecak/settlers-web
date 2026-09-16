import {sampleCurve,type TerrainStroke,type CoverPatch} from '../../src/shared/landscape/curve';
/** Keep dense cover beside the complete curved road, not just its control points. */
export function clearRoadCover(cover:CoverPatch[],strokes:TerrainStroke[]):void {
 const samples=strokes.filter(s=>s.layer==='road').flatMap(s=>sampleCurve(s.points,Math.max(1,s.radius*.85),3));
 for(const patch of cover){
  const nearby=samples.filter(p=>Math.hypot(p.x-patch.x,p.z-patch.z)<patch.radius+p.radius);
  patch.exclusions=[...(patch.exclusions??[]),...nearby];
 }
}
