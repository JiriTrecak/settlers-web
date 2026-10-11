import {z} from 'zod';

/** Texture tiles are independent of the four-unit building lattice. An import
 * can preserve its atlas corners while navigation stays one world unit. */
export const textureGridSchema=z.object({
 cellSize:z.number().min(1).max(64),
 origin:z.tuple([z.number().finite(),z.number().finite()]),
}).strict();
export type TextureGrid=z.infer<typeof textureGridSchema>;

export function textureGridLayout(origin:readonly [number,number],span:readonly [number,number],grid?:TextureGrid){
 const cellSize=grid?.cellSize??4,anchor=grid?.origin??[-.5,-.5];
 // Preserve the existing four-unit raster byte-for-byte when no grid is saved.
 const first=grid?origin.map((v,i)=>Math.floor((v-anchor[i])/cellSize)):[(origin[0])/4,(origin[1])/4];
 const start=first.map((v,i)=>anchor[i]+v*cellSize) as [number,number];
 const cells=(grid?span.map((v,i)=>Math.ceil((origin[i]+v-start[i])/cellSize)):span.map(v=>v/4)) as [number,number];
 return {cellSize,origin:anchor,start,cells,count:cells[0]*cells[1]};
}
