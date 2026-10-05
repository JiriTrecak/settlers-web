import {expect,it} from 'vitest';
import {buildGroundMesh} from '../../src/shared/navigation/groundMesh';
import {convexPolygons,type GroundMeshPoint as P} from '../../src/shared/navigation/groundMeshPolygons';

const cross=(a:P,b:P,c:P)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
const key=(p:P)=>`${Math.round(p.x*1000)},${Math.round(p.z*1000)}`;
const area=(points:P[])=>Math.abs(points.reduce((n,p,i)=>{const q=points[(i+1)%points.length]!;return n+p.x*q.z-q.x*p.z;},0)/2);
function boundary(polygons:P[][]){
 const edges=new Set<string>();
 for(const points of polygons)for(let i=0;i<points.length;i++){
  const a=key(points[i]!),b=key(points[(i+1)%points.length]!);
  if(edges.has(`${b}/${a}`))edges.delete(`${b}/${a}`);else edges.add(`${a}/${b}`);
 }
 return [...edges].sort();
}

it('reduces open ground to one convex region per tile without changing its outline',()=>{
 const mesh=buildGroundMesh({size:64,radius:.34,walkable:new Uint8Array(64*64).fill(1),heights:new Int16Array(64*64)});
 expect(mesh.triangles).toBe(8);
 for(const tile of mesh.tiles){const p=convexPolygons(tile);expect(p).toHaveLength(1);expect(p[0]).toHaveLength(4);}
});

it('preserves exact obstacle and seam edges, area and convexity on fragmented clearance tiles',()=>{
 let seed=77181,triangles=0,polygons=0;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let trial=0;trial<12;trial++){
  const size=64,walkable=new Uint8Array(size*size).fill(1);
  for(let i=0;i<60;i++){
   const x=Math.floor(random()*size),y=Math.floor(random()*size),w=1+Math.floor(random()*5),h=1+Math.floor(random()*5);
   for(let z=y;z<Math.min(size,y+h);z++)for(let a=x;a<Math.min(size,x+w);a++)walkable[z*size+a]=0;
  }
  const mesh=buildGroundMesh({size,radius:.34,walkable,heights:new Int16Array(size*size)});
  for(const tile of mesh.tiles){
   const saved=structuredClone(tile),source:P[][]=[];
   for(let i=0;i<tile.triangles.length;i+=3)source.push(tile.triangles.slice(i,i+3).map(v=>({x:tile.vertices[v*2]!/1000,z:tile.vertices[v*2+1]!/1000})));
   const merged=convexPolygons(tile);triangles+=source.length;polygons+=merged.length;
   expect(tile).toEqual(saved);expect(convexPolygons(structuredClone(tile))).toEqual(merged);
   expect(boundary(merged)).toEqual(boundary(source));
   expect(merged.reduce((sum,p)=>sum+area(p),0)).toBeCloseTo(source.reduce((sum,p)=>sum+area(p),0),6);
   for(const points of merged){
    expect(points.length).toBeGreaterThanOrEqual(3);expect(points.length).toBeLessThanOrEqual(6);
    expect(new Set(points.map(key)).size).toBe(points.length);
    for(let i=0;i<points.length;i++)expect(cross(points[i]!,points[(i+1)%points.length]!,points[(i+2)%points.length]!)).toBeLessThanOrEqual(1e-8);
   }
  }
 }
 expect(polygons).toBeLessThan(triangles*.7);
});

it('matches welded geometry when adjacent triangles have duplicated vertex indices',()=>{
 const mesh=buildGroundMesh({size:64,radius:.595,walkable:new Uint8Array(64*64).fill(1),heights:new Int16Array(64*64)});
 for(const tile of mesh.tiles){
  const vertices:number[]=[],triangles:number[]=[];
  for(const index of tile.triangles){triangles.push(vertices.length/2);vertices.push(tile.vertices[index*2]!,tile.vertices[index*2+1]!);}
  const unwelded={...tile,vertices,triangles};
  expect(convexPolygons(unwelded)).toEqual(convexPolygons(tile));
 }
});
