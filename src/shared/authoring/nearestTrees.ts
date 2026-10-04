import type {TerrainGrid} from './generate';

/** Exact nearest-trunk samples within each tree's authored square influence.
 * Squared rejection avoids a hypot for candidates that cannot improve the
 * stored Float32 distance. Accepted candidates retain the original hypot and
 * rounding, including sub-grid positions and distances outside the circle. */
export function nearestTrees(grid:TerrainGrid,trees:readonly {x:number;z:number}[],range:number):Float32Array{
 const nearest=new Float32Array(grid.width*grid.height).fill(Infinity);
 for(const tree of trees){
  const x0=Math.max(0,Math.floor((tree.x-range-grid.originX)/grid.step)),x1=Math.min(grid.width-1,Math.ceil((tree.x+range-grid.originX)/grid.step));
  const z0=Math.max(0,Math.floor((tree.z-range-grid.originZ)/grid.step)),z1=Math.min(grid.height-1,Math.ceil((tree.z+range-grid.originZ)/grid.step));
  for(let z=z0;z<=z1;z++){
   const dz=grid.originZ+z*grid.step-tree.z,dz2=dz*dz,row=z*grid.width;
   for(let x=x0;x<=x1;x++){
    const i=row+x,dx=grid.originX+x*grid.step-tree.x,best=nearest[i];
    if(dx*dx+dz2>(best+1e-10)*(best+1e-10))continue;
    const distance=Math.hypot(dx,dz);if(distance<best)nearest[i]=distance;
   }
  }
 }
 return nearest;
}

type TreePoint={x:number;z:number};
export type NearestTreeSnapshot={layout:string;points:ReadonlyMap<string,{point:TreePoint;count:number}>;values:Float32Array};
const TILE=16;
/** Recompute only tiles touched by added/removed tree influence squares. Every
 * current tree overlapping those tiles participates, so removing a nearest tree
 * reveals its next neighbour. Earlier snapshots are never mutated. */
export function updateNearestTrees(grid:TerrainGrid,trees:readonly TreePoint[],range:number,previous?:NearestTreeSnapshot):NearestTreeSnapshot{
 const layout=[grid.originX,grid.originZ,grid.step,grid.width,grid.height,range].join('/');
 const points=new Map<string,{point:TreePoint;count:number}>();
 for(const tree of trees){const key=tree.x+','+tree.z,entry=points.get(key);if(entry)entry.count++;else points.set(key,{point:{x:tree.x,z:tree.z},count:1});}
 const full=()=>({layout,points,values:nearestTrees(grid,trees,range)});
 if(!previous||previous.layout!==layout)return full();
 const changed:TreePoint[]=[];
 for(const [key,entry] of previous.points)if(points.get(key)?.count!==entry.count)changed.push(entry.point);
 for(const [key,entry] of points)if(previous.points.get(key)?.count!==entry.count)changed.push(entry.point);
 if(!changed.length)return {layout,points,values:previous.values};
 const tw=Math.ceil(grid.width/TILE),th=Math.ceil(grid.height/TILE),dirty=new Uint8Array(tw*th);
 let dirtyCount=0;
 const bounds=(tree:TreePoint)=>({
  x0:Math.max(0,Math.floor((tree.x-range-grid.originX)/grid.step)),x1:Math.min(grid.width-1,Math.ceil((tree.x+range-grid.originX)/grid.step)),
  z0:Math.max(0,Math.floor((tree.z-range-grid.originZ)/grid.step)),z1:Math.min(grid.height-1,Math.ceil((tree.z+range-grid.originZ)/grid.step)),
 });
 for(const point of changed){const b=bounds(point);
  for(let z=Math.floor(b.z0/TILE);z<=Math.floor(b.z1/TILE);z++)for(let x=Math.floor(b.x0/TILE);x<=Math.floor(b.x1/TILE);x++){
   const i=z*tw+x;if(!dirty[i]){dirty[i]=1;dirtyCount++;}
  }
 }
 if(dirtyCount>dirty.length/2)return full();
 if(!dirtyCount)return {layout,points,values:previous.values};
 const values=previous.values.slice();
 for(let tz=0;tz<th;tz++)for(let tx=0;tx<tw;tx++)if(dirty[tz*tw+tx]){
  for(let z=tz*TILE;z<Math.min(grid.height,(tz+1)*TILE);z++)values.fill(Infinity,z*grid.width+tx*TILE,z*grid.width+Math.min(grid.width,(tx+1)*TILE));
 }
 for(const tree of trees){const b=bounds(tree);
  for(let tz=Math.floor(b.z0/TILE);tz<=Math.floor(b.z1/TILE);tz++)for(let tx=Math.floor(b.x0/TILE);tx<=Math.floor(b.x1/TILE);tx++){
   if(!dirty[tz*tw+tx])continue;
   const x0=Math.max(b.x0,tx*TILE),x1=Math.min(b.x1,(tx+1)*TILE-1),z0=Math.max(b.z0,tz*TILE),z1=Math.min(b.z1,(tz+1)*TILE-1);
   for(let z=z0;z<=z1;z++){
    const dz=grid.originZ+z*grid.step-tree.z,dz2=dz*dz,row=z*grid.width;
    for(let x=x0;x<=x1;x++){
     const i=row+x,dx=grid.originX+x*grid.step-tree.x,best=values[i];
     if(dx*dx+dz2>(best+1e-10)*(best+1e-10))continue;
     const distance=Math.hypot(dx,dz);if(distance<best)values[i]=distance;
    }
   }
  }
 }
 return {layout,points,values};
}
