import type {SceneryItem} from './sceneryIndex';

export type SceneryTile={x:number;y:number;width:number;height:number;items:readonly SceneryItem[]};
/** Integer pixel clips keep overlapping crowns and translucent shadows exact.
 * Painter order is preserved within each tile; only changed tiles are redrawn. */
export class MinimapSceneryTiles {
 private tiles:SceneryTile[]=[];
 private size=0;
 private pixels=0;
 update(items:readonly SceneryItem[],size:number,pixels:number,force=false):SceneryTile[]{
  const tileSize=32,columns=Math.ceil(pixels/tileSize),scale=pixels/size;
  const next:SceneryItem[][]=Array.from({length:columns*columns},()=>[]);
  for(const item of items){
   const s=item.stamp,x=(s.x+.5)*scale,y=(s.y+.5)*scale,r=sceneryRadius(item,scale);
   // Every crown, rotated highlight, rock and offset shadow fits within 1.5r;
   // one additional pixel includes antialiasing outside the analytic boundary.
   const extent=1.5*r+1;
   const left=Math.max(0,Math.floor((x-extent)/tileSize)),right=Math.min(columns-1,Math.floor((x+extent)/tileSize));
   const top=Math.max(0,Math.floor((y-extent)/tileSize)),bottom=Math.min(columns-1,Math.floor((y+extent)/tileSize));
   for(let row=top;row<=bottom;row++)for(let col=left;col<=right;col++)next[row*columns+col].push(item);
  }
  force ||= this.size!==size||this.pixels!==pixels;
  this.size=size;this.pixels=pixels;
  const dirty:SceneryTile[]=[];
  this.tiles=next.map((items,i)=>{
   const previous=this.tiles[i];
   if(!force&&previous&&previous.items.length===items.length&&items.every((item,j)=>item===previous.items[j]))return previous;
   const x=(i%columns)*tileSize,y=Math.floor(i/columns)*tileSize;
   const tile={x,y,width:Math.min(tileSize,pixels-x),height:Math.min(tileSize,pixels-y),items};dirty.push(tile);return tile;
  });
  return dirty;
 }
}

export function sceneryRadius(item:SceneryItem,scale:number):number{
 const s=item.stamp;return Math.max(.8,Math.min(5,(s.scale??1)*(s.widthScale??1)*1.8*scale));
}
