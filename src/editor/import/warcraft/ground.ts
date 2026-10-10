import type {WarcraftTerrain} from './terrain';

export type WarcraftCliffDefinitions=Record<string,{groundTile:string}>;
/** Warcraft uses the cliff type's ground tile around cliff cells, overriding
 * each corner's ordinary paint. Resolve once during import, then save normal
 * editable material weights. Corner order follows the source W3E raster.
 * Reference: mdx-m3-viewer's W3X Map.cornerTexture / cliffGroundIndex. */
export function warcraftCornerGround(terrain:WarcraftTerrain,definitions:WarcraftCliffDefinitions):Uint8Array{
 const {width,height,corners,cliffTiles,groundTiles}=terrain,result=Uint8Array.from(corners,c=>c.texture);
 const cellGround=new Int16Array((width-1)*(height-1)).fill(-1);
 for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
  const corner=corners[y*width+x],level=corner.level;
  if([corners[y*width+x+1],corners[(y+1)*width+x],corners[(y+1)*width+x+1]].every(c=>c.level===level))continue;
  const index=corner.cliffTexture===15?1:corner.cliffTexture,id=cliffTiles[index],definition=definitions[id];
  if(!definition)throw Error(`Cliff texture ${id??index} is unavailable. Import its source definition.`);
  // Warcraft falls back to its first ground tile when the cliff's preferred
  // ground is absent from this map's selected tileset.
  cellGround[y*(width-1)+x]=Math.max(0,groundTiles.indexOf(definition.groundTile));
 }
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  let resolved=false;
  for(let dy=-1;dy<=0&&!resolved;dy++)for(let dx=-1;dx<=0;dx++){
   const cx=x+dx,cy=y+dy;
   if(cx<=0||cy<=0||cx>=width-2||cy>=height-2)continue;
   const material=cellGround[cy*(width-1)+cx];
   if(material>=0){result[y*width+x]=material;resolved=true;break;}
  }
 }
 return result;
}

/** Source cliff ownership per cell; only used definitions need assets. */
export function warcraftCliffCells(terrain:WarcraftTerrain):Int16Array {
 const {width,height,corners}=terrain,result=new Int16Array((width-1)*(height-1)).fill(-1);
 for(let y=0;y<height-1;y++)for(let x=0;x<width-1;x++){
  const a=corners[y*width+x],cell=[a,corners[y*width+x+1],corners[(y+1)*width+x],corners[(y+1)*width+x+1]];
  if(cell.every(c=>c.level===a.level))continue;
  result[y*(width-1)+x]=a.cliffTexture===15?1:a.cliffTexture;
 }
 return result;
}
