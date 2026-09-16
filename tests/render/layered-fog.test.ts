import {expect,it} from 'vitest';
import {Scene,Mesh,PlaneGeometry,MeshStandardMaterial} from 'three';
import {FogRaster} from '../../src/render/visibility/fogRaster';
import {FogAtlas} from '../../src/render/visibility/fogAtlas';
import {FogOfWar} from '../../src/render/visibility/fogOfWar';

it('updates only affected blur rows with the same result as a full recompute',()=>{
 const size=16,cells=new Uint8Array(size*size),raster=new FogRaster(size);raster.update(cells);
 for(let i=0;i<80;i++){
  const cell=(i*37+13)%cells.length;cells[cell]=i%3;raster.update(cells);
  const fresh=new FogRaster(size);fresh.update(cells);expect(raster.light).toEqual(fresh.light);
 }
});
it('keeps a one-cell-wide visible deck bright while masking its empty neighbors',()=>{
 const mask=new Uint8Array(64),cells=new Uint8Array(64);for(let y=0;y<8;y++)mask[y*8+4]=1;
 const raster=new FogRaster(8,mask);for(let y=0;y<8;y++)cells[y*8+4]=2;raster.update(cells);
 for(let y=0;y<8;y++)expect(raster.light[y*8+4]).toBe(255);
});
const pixel=(atlas:FogAtlas,rank:number,cell:number)=>{
 const image=atlas.texture.image;
 const index=((Math.floor(rank/atlas.columns)*atlas.size+Math.floor(cell/atlas.size))*image.width+(rank%atlas.columns)*atlas.size+cell%atlas.size)*4;
 return Array.from(image.data!.subarray(index,index+4));
};
it('packs separate stacked floors by overlap depth and keeps their heights and sight independent',()=>{
 const nodes=[{cell:10,height:1200},{cell:10,height:400},{cell:20,height:2500},{cell:10,height:400}];
 const atlas=new FogAtlas(8,nodes),cells=new Uint8Array(64+nodes.length);cells.fill(2,0,64);cells[64]=2;cells[66]=1;
 atlas.update(cells);expect(atlas.count).toBe(3); // Distant and duplicate decks reuse slices.
 expect(atlas.bounds.toArray()).toEqual([1.5,.5,4.5,2.5]);
 expect(pixel(atlas,0,27)[0]).toBe(255);expect(pixel(atlas,1,10)[0]).toBe(0);expect(pixel(atlas,2,10)[0]).toBe(255);
 expect(pixel(atlas,1,20)[0]).toBe(90);expect(pixel(atlas,1,0)[3]).toBe(0);
 for(const [rank,cell,height] of [[1,10,4],[2,10,12],[1,20,25]]){
  const p=pixel(atlas,rank!,cell!);expect(atlas.heightRange.x+(p[1]!*256+p[2]!)/65535*atlas.heightRange.y).toBeCloseTo(height!,3);
 }
 const updated=cells.slice();updated[65]=1;atlas.update(updated);expect(pixel(atlas,1,10)[0]).toBe(90);expect(pixel(atlas,2,10)[0]).toBe(255);atlas.dispose();
});
it('switches reveal mode without retaining a deck mask and preserves material shader hooks',()=>{
 const fog=new FogOfWar(8),scene=new Scene(),material=new MeshStandardMaterial(),geometry=new PlaneGeometry();scene.add(new Mesh(geometry,material));
 material.onBeforeCompile=s=>{s.uniforms.other={value:17};};
 const nodes=[{cell:10,height:400}],cells=new Uint8Array(65);cells.fill(2,0,64);
 fog.update({cells:cells.slice(0,64),floors:{cells,decks:nodes},owner:1,revision:1},scene);
 const shader={vertexShader:'#include <project_vertex>',fragmentShader:'#include <fog_fragment>',uniforms:{} as Record<string,{value:unknown}>};material.onBeforeCompile(shader as never,{} as never);
 expect(shader.uniforms.other.value).toBe(17);expect(shader.uniforms.utcFogLayerCount.value).toBe(2);
 expect(shader.uniforms.utcVisibility.value).not.toBe(fog.texture);
 fog.update({cells:new Uint8Array(64).fill(2),owner:-1,revision:-2},scene);
 expect(shader.uniforms.utcFogLayerCount.value).toBe(1);expect(shader.uniforms.utcVisibility.value).toBe(fog.texture);
 fog.dispose();geometry.dispose();material.dispose();
});
