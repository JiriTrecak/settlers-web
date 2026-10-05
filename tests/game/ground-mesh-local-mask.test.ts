import {expect,it} from 'vitest';
import {GroundMeshBuilder,GROUND_MESH_TILE_SIZE,type GroundMeshInput} from '../../src/shared/navigation/groundMesh';

it('local mask edits match full mask rebuilds through obstacle and height changes',()=>{
 let seed=395;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
 for(const radius of [0,.34,.595,1.7,2,3.1]){
  const size=65,width=Math.ceil(size/GROUND_MESH_TILE_SIZE);
  const input:GroundMeshInput={size,radius,walkable:Uint8Array.from({length:size*size},()=>+(random()>.025)),heights:new Int16Array(size*size)};
  const local=new GroundMeshBuilder(),whole=new GroundMeshBuilder();
  local.build(input);whole.build(input);
  for(let turn=0;turn<24;turn++){
   const cells=new Set<number>();
   for(let i=0;i<1+turn%5;i++){
    const x=turn<6?[0,1,31,32,63,64][turn]!:Math.floor(random()*size),z=Math.floor(random()*size),cell=z*size+x;
    if(turn%2)input.walkable[cell]=1-input.walkable[cell]!;
    else input.heights[cell]=input.heights[cell]===0?200:0;
    cells.add(cell);
   }
   const changed=[...cells],dirty=new Set<number>(),halo=Math.ceil(radius)+1;
   for(const cell of changed){const x=cell%size,z=Math.floor(cell/size);
    for(let tz=Math.max(0,Math.floor((z-halo)/32));tz<=Math.min(width-1,Math.floor((z+halo)/32));tz++)
     for(let tx=Math.max(0,Math.floor((x-halo)/32));tx<=Math.min(width-1,Math.floor((x+halo)/32));tx++)dirty.add(tz*width+tx);
   }
   const ids=[...dirty].sort((a,b)=>a-b),updated=local.build(input,ids,changed),baseline=whole.build(input,ids);
   expect(updated.tiles).toEqual(baseline.tiles);expect(updated.rebuiltTileIds).toEqual(baseline.rebuiltTileIds);
  }
 }
});

it('retains unchanged tiles and handles broad edits and changed profiles',()=>{
 const size=64,input:GroundMeshInput={size,radius:.595,walkable:new Uint8Array(size*size).fill(1),heights:new Int16Array(size*size)};
 const builder=new GroundMeshBuilder(),original=builder.build(input);
 const unchanged=builder.build(input,[0],[]);expect(unchanged.rebuiltTileIds).toEqual([]);expect(unchanged.tiles[0]).toBe(original.tiles[0]);
 const cells:number[]=[];for(let y=0;y<size;y++)for(let x=8;x<24;x++){const cell=y*size+x;input.walkable[cell]=0;cells.push(cell);}
 expect(builder.build(input,[0,1,2,3],cells).tiles).toEqual(new GroundMeshBuilder().build(input).tiles);
 input.radius=.34;
 expect(builder.build(input,[0,1,2,3],[]).tiles).toEqual(new GroundMeshBuilder().build(input).tiles);
});
