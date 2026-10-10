import {z} from 'zod';
import {groundTextures,isCliffMaterial} from './groundTextures';
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
  z.object({type:z.literal('material'),material:z.string().min(1),erase:z.boolean().optional(),variant:z.number().int().min(0).max(255).optional()}).strict(),
 ]),
}).strict().superRefine((edit,ctx)=>{
 const op=edit.operation;
 if(op.type==='water'&&op.surfaceLevel*rules.levelHeight-(op.depth==='shallow'?rules.shallowDepth:rules.deepDepth)<HEIGHT_MIN)
  ctx.addIssue({code:'custom',path:['operation','surfaceLevel'],message:'Water bed would be below the minimum terrain height; raise the surface level'});
});
export type GridTerrainEdit=z.infer<typeof gridTerrainEditSchema>;
export function editTerrainGrid(data:TerrainData,input:GridTerrainEdit):{terrain:TerrainData;samples:number}{
 const edit=gridTerrainEditSchema.parse(input),field=new HeightField(data.size);restoreTerrain(field,data);
 const area=edit.selection.type==='polygon'?{type:'lasso' as const,points:edit.selection.points}:edit.selection;
 const water=field.cellWater!,operation=edit.operation,original=field.samples.slice();
 const untouched=new HeightField(data.size);untouched.samples.set(original);
 const polygon=edit.selection.type==='polygon'?edit.selection.points:[edit.selection.from,{x:edit.selection.to.x,z:edit.selection.from.z},edit.selection.to,{x:edit.selection.from.x,z:edit.selection.to.z}];
 const minX=Math.min(...polygon.map(p=>p.x)),maxX=Math.max(...polygon.map(p=>p.x)),minZ=Math.min(...polygon.map(p=>p.z)),maxZ=Math.max(...polygon.map(p=>p.z));
 const boundary=(x:number,z:number)=>{
  let distance=Infinity,px=x,pz=z;
  for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length],limit=data.size/rules.cellSize;if((a.x===b.x&&(a.x<=0||a.x>=limit))||(a.z===b.z&&(a.z<=0||a.z>=limit)))continue;const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1))),qx=a.x+dx*t,qz=a.z+dz*t,d=Math.hypot(x-qx,z-qz);if(d<distance){distance=d;px=qx;pz=qz;}}
  // For an exterior bank, sample beyond its outer edge. The reference is
  // untouched by this operation, so repeated Apply cannot accumulate erosion.
  const nx=distance>1e-8?(x-px)/distance:0,nz=distance>1e-8?(z-pz)/distance:0;
  return {distance,px,pz,nx,nz};
 };
 const bankCells=operation.type==='water'?operation.bankCells??rules.bankCells:
  operation.type==='level'&&operation.edge==='bank'?operation.bankCells??rules.bankCells:0;
 const target=operation.type==='water'?operation.surfaceLevel*rules.levelHeight-(operation.depth==='shallow'?rules.shallowDepth:rules.deepDepth):
  operation.type==='level'||operation.type==='dry'?operation.level*rules.levelHeight:undefined;
 let paint:Float32Array|undefined;
 if(operation.type==='material'){
  let layer=field.surfacePaint!.find(p=>p.material===operation.material);
  if(!layer){layer={owner:'terrain',material:operation.material,weights:new Float32Array(field.samples.length)};field.surfacePaint!.push(layer);}paint=layer.weights;
  const ground=groundTextures.get(operation.material)?.terrain;
  if(ground&&!operation.erase){
   const cells=field.span/rules.cellSize,count=ground.atlas.fullTiles.length;
   if(operation.variant!==undefined&&operation.variant>=count)throw Error('Ground tile variant is outside this material atlas');
   layer.variants??=new Uint8Array(cells*cells);
   for(let z=0;z<cells;z++)for(let x=0;x<cells;x++){
    const cx=x+field.origin/rules.cellSize+.5,cz=z+field.origin/rules.cellSize+.5;
    if(!areaContains(area,cx,cz))continue;
    // Choose during the editing operation; saved values are never regenerated on load.
    let hash=Math.imul(x+1,73856093)^Math.imul(z+1,19349663);hash=Math.imul(hash^(hash>>>16),2246822519);
    layer.variants[z*cells+x]=operation.variant??((hash^(hash>>>13))>>>0)%count;
   }
  }
 }
 let samples=0;
 for(let z=0;z<field.verts;z++)for(let x=0;x<field.verts;x++){
  const wx=x+field.origin,wz=z+field.origin,cx=(wx-rules.origin)/rules.cellSize,cz=(wz-rules.origin)/rules.cellSize;
  if(cx<minX-bankCells||cx>maxX+bankCells||cz<minZ-bankCells||cz>maxZ+bankCells)continue;
  const inside=areaContains(area,cx,cz),bank=!inside&&bankCells>0?boundary(cx,cz):undefined;
  if(!inside&&(!bank||bank.distance>=bankCells))continue;
  const i=z*field.verts+x;samples++;
  if(target!==undefined){
   if(inside)field.samples[i]=target;
   else if(bank){
    // A concave outline can put the first reference point in another bank.
    // Continue outward until its interpolation neighbours are all beyond the
    // affected region; otherwise each Apply would sample and erode its own work.
    let outerHeight=target;
    const limit=data.size/rules.cellSize;
    for(let outside=bankCells+.5;outside<=Math.hypot(maxX-minX,maxZ-minZ)+bankCells*2+1;outside+=.5){
     const rx=bank.px+bank.nx*outside,rz=bank.pz+bank.nz*outside;
     if(rx<0||rz<0||rx>=limit||rz>=limit)break;
     if(areaContains(area,rx,rz)||boundary(rx,rz).distance<bankCells+.5)continue;
     outerHeight=untouched.sample(rx*rules.cellSize+rules.origin,rz*rules.cellSize+rules.origin);break;
    }
    const value=target+(outerHeight-target)*bank.distance/bankCells;
    // Joining a neighbouring patch of the same level must not lift a ridge
    // through it. Keep samples that are already closer to the painted level.
    const old=original[i],between=target<=outerHeight?old>=target&&old<=value:old<=target&&old>=value;
    field.samples[i]=between?old:value;
   }
  }
  if(operation.type==='ramp'){
   const alongX=operation.direction==='east'||operation.direction==='west',reverse=operation.direction==='north'||operation.direction==='west';
   let t=Math.max(0,Math.min(1,alongX?(cx-minX)/(maxX-minX||1):(cz-minZ)/(maxZ-minZ||1)));if(reverse)t=1-t;
   field.samples[i]=(operation.fromLevel+(operation.toLevel-operation.fromLevel)*t)*rules.levelHeight;
  }
  if(operation.type==='dry')water.heights[i]=HEIGHT_MIN-1;
  if(operation.type==='water'){
   const surface=operation.surfaceLevel*rules.levelHeight;
   // A one-sample apron keeps triangles crossing a bank horizontal. It changes
   // the water surface only; the dry bank's ground height still clips it away.
   for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
    const nx=x+dx,nz=z+dz;if(nx>=0&&nz>=0&&nx<field.verts&&nz<field.verts)water.heights[nz*field.verts+nx]=surface;
   }
  }
  if(paint&&operation.type==='material'){
   const cliff=isCliffMaterial(operation.material);
   if(operation.erase)paint[i]=0;
   else for(const p of field.surfacePaint!)if(isCliffMaterial(p.material)===cliff)p.weights[i]=p.weights===paint?1:0;
   if(!cliff&&!operation.erase){field.grassCoverage![i]=0;field.rockCoverage![i]=0;}
  }
 }
 return {terrain:captureTerrain(field),samples};
}
