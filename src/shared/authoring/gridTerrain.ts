import {z} from 'zod';
import {TERRAIN_AUTHORING as rules} from '../../content/terrain';
import {HEIGHT_MIN,HEIGHT_MAX,HeightField} from '../map/height';
import {captureTerrain} from './captureTerrain';
import {restoreTerrain,type TerrainData} from '../map/terrainData';
import {areaContains} from './cleanup';

const coordinate=z.number().finite().multipleOf(.5).min(-1024).max(1024);
const point=z.object({x:coordinate,z:coordinate}).strict();
/** Coordinates are terrain cells. Half-cell vertices expose edge midpoints for
 * diagonal and corner cuts without introducing an unrelated freeform surface. */
export const terrainSelectionSchema=z.discriminatedUnion('type',[
 z.object({type:z.literal('rectangle'),from:point,to:point}).strict(),
 z.object({type:z.literal('polygon'),points:z.array(point).min(3).max(2048)}).strict(),
]);
const level=z.number().int().refine(n=>n*rules.levelHeight>=HEIGHT_MIN&&n*rules.levelHeight<=HEIGHT_MAX,'Level outside terrain height range');
export const gridTerrainEditSchema=z.object({
 selection:terrainSelectionSchema,
 operation:z.discriminatedUnion('type',[
  z.object({type:z.literal('level'),level,edge:z.enum(['cliff','bank']).optional(),bankCells:z.number().min(.5).max(4).optional()}).strict(),
  z.object({type:z.literal('water'),surfaceLevel:level,depth:z.enum(['shallow','deep']),bankCells:z.number().min(0).max(4).optional()}).strict(),
  z.object({type:z.literal('dry'),level}).strict(),
  z.object({type:z.literal('ramp'),fromLevel:level,toLevel:level,direction:z.enum(['north','east','south','west'])}).strict(),
  z.object({type:z.literal('material'),material:z.string().min(1)}).strict(),
 ]),
}).strict();
export type GridTerrainEdit=z.infer<typeof gridTerrainEditSchema>;
export function editTerrainGrid(data:TerrainData,input:GridTerrainEdit):{terrain:TerrainData;samples:number}{
 const edit=gridTerrainEditSchema.parse(input),field=new HeightField(data.size);restoreTerrain(field,data);
 const area=edit.selection.type==='polygon'?{type:'lasso' as const,points:edit.selection.points}:edit.selection;
 const water=field.cellWater!,operation=edit.operation,original=field.samples.slice();
 const polygon=edit.selection.type==='polygon'?edit.selection.points:[edit.selection.from,{x:edit.selection.to.x,z:edit.selection.from.z},edit.selection.to,{x:edit.selection.from.x,z:edit.selection.to.z}];
 const minX=Math.min(...polygon.map(p=>p.x)),maxX=Math.max(...polygon.map(p=>p.x)),minZ=Math.min(...polygon.map(p=>p.z)),maxZ=Math.max(...polygon.map(p=>p.z));
 const boundary=(x:number,z:number)=>{
  let distance=Infinity,px=x,pz=z;
  for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length],limit=data.size/rules.cellSize;if((a.x===b.x&&(a.x<=0||a.x>=limit))||(a.z===b.z&&(a.z<=0||a.z>=limit)))continue;const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1))),qx=a.x+dx*t,qz=a.z+dz*t,d=Math.hypot(x-qx,z-qz);if(d<distance){distance=d;px=qx;pz=qz;}}
  // Sample beyond the selection's outside vertices. Repeating an absolute bank
  // operation must not progressively erode the bank painted by the first Apply.
  const nx=distance>1e-8?(px-x)/distance:0,nz=distance>1e-8?(pz-z)/distance:0;
  const wx=(px+nx*.5)*rules.cellSize+rules.origin,wz=(pz+nz*.5)*rules.cellSize+rules.origin;
  const gx=Math.max(0,Math.min(field.span,wx-field.origin)),gz=Math.max(0,Math.min(field.span,wz-field.origin)),ix=Math.floor(gx),iz=Math.floor(gz),jx=Math.min(field.span,ix+1),jz=Math.min(field.span,iz+1),u=gx-ix,v=gz-iz,w=field.verts;
  const height=(original[iz*w+ix]*(1-u)+original[iz*w+jx]*u)*(1-v)+(original[jz*w+ix]*(1-u)+original[jz*w+jx]*u)*v;
  return {distance,height};
 };
 const bankWidth=(cells:number)=>Math.min(cells,Math.max(.125,Math.min(maxX-minX,maxZ-minZ)/2-.125));
 let paint:Float32Array|undefined;
 if(operation.type==='material'){
  let layer=field.surfacePaint!.find(p=>p.material===operation.material);
  if(!layer){layer={owner:'terrain',material:operation.material,weights:new Float32Array(field.samples.length)};field.surfacePaint!.push(layer);}paint=layer.weights;
 }
 let samples=0;
 for(let z=0;z<field.verts;z++)for(let x=0;x<field.verts;x++){
  const wx=x+field.origin,wz=z+field.origin,cx=(wx-rules.origin)/rules.cellSize,cz=(wz-rules.origin)/rules.cellSize;
  if(!areaContains(area,cx,cz))continue;
  const i=z*field.verts+x;samples++;
  if(operation.type==='level'||operation.type==='dry'){
   const bank=operation.type==='level'&&operation.edge==='bank'?boundary(cx,cz):undefined,blend=bank?Math.min(1,bank.distance/bankWidth(operation.type==='level'?operation.bankCells??rules.bankCells:rules.bankCells)):1;
   const base=bank?.height??original[i];field.samples[i]=base+(operation.level*rules.levelHeight-base)*blend;
  }
  if(operation.type==='ramp'){
   const alongX=operation.direction==='east'||operation.direction==='west',reverse=operation.direction==='north'||operation.direction==='west';
   let t=Math.max(0,Math.min(1,alongX?(cx-minX)/(maxX-minX||1):(cz-minZ)/(maxZ-minZ||1)));if(reverse)t=1-t;
   field.samples[i]=(operation.fromLevel+(operation.toLevel-operation.fromLevel)*t)*rules.levelHeight;
  }
  if(operation.type==='dry')water.heights[i]=HEIGHT_MIN-1;
  if(operation.type==='water'){
   const surface=operation.surfaceLevel*rules.levelHeight;
   const target=surface-(operation.depth==='shallow'?rules.shallowDepth:rules.deepDepth);
   // Banks are terrain slopes below a separate horizontal water surface. Their
   // depth, rather than a texture or a shore object, determines walkability.
   const bank=boundary(cx,cz),width=bankWidth(operation.bankCells??rules.bankCells),blend=width>0?Math.min(1,bank.distance/width):1;
   field.samples[i]=bank.height+(target-bank.height)*blend;
   // A one-sample apron keeps triangles crossing a bank horizontal. It changes
   // the water surface only; the dry bank's ground height still clips it away.
   for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
    const nx=x+dx,nz=z+dz;if(nx>=0&&nz>=0&&nx<field.verts&&nz<field.verts)water.heights[nz*field.verts+nx]=surface;
   }
  }
  if(paint){for(const p of field.surfacePaint!)p.weights[i]=p.weights===paint?1:0;field.grassCoverage![i]=0;field.rockCoverage![i]=0;}
 }
 return {terrain:captureTerrain(field),samples};
}
