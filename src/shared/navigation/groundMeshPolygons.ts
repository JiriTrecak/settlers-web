import type {GroundMeshTile} from './groundMesh';
export type GroundMeshPoint={x:number;z:number};
type P=GroundMeshPoint;
const cross=(a:P,b:P,c:P)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
/** Deterministic tile-local convex regions with at most six vertices. Indexed
 * edge identities avoid reconstructing coordinate strings on every merge pass.
 * Canonicalize coordinates once: imported triangles may duplicate vertex IDs.
 * Keep the original merge order and collinear subdivisions for stable portals. */
export function convexPolygons(tile:GroundMeshTile):P[][] {
 const vertices:P[]=[],keys:number[]=[],canonical=new Map<string,number>();
 for(let i=0;i<tile.vertices.length;i+=2){
  const p={x:tile.vertices[i]!/1000,z:tile.vertices[i+1]!/1000};vertices.push(p);
  const key=`${Math.round(p.x*1000)},${Math.round(p.z*1000)}`;
  let id=canonical.get(key);if(id===undefined){id=canonical.size;canonical.set(key,id);}keys.push(id);
 }
 const width=canonical.size,polygons:(number[]|null)[]=[];
 for(let i=0;i<tile.triangles.length;i+=3)polygons.push(tile.triangles.slice(i,i+3));
 const merge=(a:number[],ai:number,b:number[],bi:number):number[]|undefined=>{
  if(a.length+b.length-2>6)return;
  const points:number[]=[];
  for(let k=1;k<=a.length;k++)points.push(a[(ai+k)%a.length]!);
  for(let k=2;k<b.length;k++)points.push(b[(bi+k)%b.length]!);
  for(let i=0;i<points.length;i++)for(let j=0;j<i;j++){
   const p=vertices[points[i]!]!,q=vertices[points[j]!]!;if(p.x===q.x&&p.z===q.z)return;
  }
  for(let i=0;i<points.length;i++)if(cross(vertices[points[i]!]!,vertices[points[(i+1)%points.length]!]!,vertices[points[(i+2)%points.length]!]!)>1e-8)return;
  return points;
 };
 let changed=true;
 while(changed){
  changed=false;
  const edges=new Map<number,{id:number;edge:number;points:number[]}>();
  for(let id=0;id<polygons.length;id++){
   const points=polygons[id];if(!points)continue;
   for(let edge=0;edge<points.length;edge++){
    const a=keys[points[edge]!]!,b=keys[points[(edge+1)%points.length]!]!,other=edges.get(b*width+a);
    if(other&&polygons[other.id]===other.points){
     const combined=merge(other.points,other.edge,points,edge);
     if(combined){polygons[other.id]=combined;polygons[id]=null;changed=true;break;}
    }
    edges.set(a*width+b,{id,edge,points});
   }
  }
 }
 return polygons.filter((points):points is number[]=>!!points).map(points=>points.map(i=>vertices[i]!));
}
