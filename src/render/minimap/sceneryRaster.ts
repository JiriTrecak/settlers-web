import type {SceneryItem} from './sceneryIndex';
import {MinimapSceneryTiles,sceneryRadius} from './sceneryTiles';

/** Shared painter for full rasters and clipped updates. Source order is significant. */
export function drawScenery(ctx:CanvasRenderingContext2D,items:readonly SceneryItem[],scale:number,palette:{forest:string;crown:string}):void{
 for(const item of items){
  const {stamp:s,kind}=item;
  const x=(s.x+.5)*scale,y=(s.y+.5)*scale;
  const radius=sceneryRadius(item,scale);
  if(kind==='tree'){
   ctx.fillStyle='#17251485';ctx.beginPath();ctx.ellipse(x+radius*.35,y+radius*.45,radius*1.15,radius*.8,0,0,Math.PI*2);ctx.fill();
   ctx.fillStyle=s.variant==='gold'?'#796e30':s.variant==='red'?'#774a2a':palette.forest;ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();
   ctx.fillStyle=s.variant==='gold'?'#9a9146':palette.crown;ctx.beginPath();ctx.ellipse(x-radius*.22,y-radius*.22,radius*.57,radius*.65,-.3,0,Math.PI*2);ctx.fill();
  }else{
   ctx.fillStyle='#363e3480';ctx.fillRect(x-radius,y-radius*.5,radius*2.3,radius*1.8);
   ctx.fillStyle='#999b80';ctx.beginPath();ctx.moveTo(x-radius,y);ctx.lineTo(x-radius*.5,y-radius);ctx.lineTo(x+radius*.7,y-radius*.7);ctx.lineTo(x+radius,y+radius*.55);ctx.lineTo(x,y+radius*.75);ctx.closePath();ctx.fill();
  }
 }
}

/** Repaint a local patch without changing Canvas2D curve antialiasing at clip edges.
 * Rasterize complete shapes in global coordinates, then copy integer rectangles. */
export class MinimapSceneryRaster {
 private readonly tiles=new MinimapSceneryTiles();
 private pixels=0;
 private size=0;
 constructor(private readonly scratch:HTMLCanvasElement=document.createElement('canvas')){}
 paint(target:CanvasRenderingContext2D,terrain:HTMLCanvasElement,items:readonly SceneryItem[],size:number,palette:{forest:string;crown:string},force=false):void{
  const pixels=target.canvas.width;
  force ||= this.pixels!==pixels||this.size!==size;
  this.pixels=pixels;this.size=size;
  const dirty=this.tiles.update(items,size,pixels,force);
  if(!dirty.length)return;
  const render=(ctx:CanvasRenderingContext2D,items:readonly SceneryItem[])=>{
   ctx.clearRect(0,0,pixels,pixels);ctx.drawImage(terrain,0,0);
   drawScenery(ctx,items,pixels/size,palette);
   const vignette=ctx.createRadialGradient(pixels/2,pixels/2,pixels*.3,pixels/2,pixels/2,pixels*.72);
   vignette.addColorStop(0,'transparent');vignette.addColorStop(1,'#14201955');ctx.fillStyle=vignette;ctx.fillRect(0,0,pixels,pixels);
  };
  // Large edits and first construction remain one linear raster.
  if(force||dirty.length>Math.ceil(pixels/32)**2/4){render(target,items);return;}
  if(this.scratch.width!==pixels||this.scratch.height!==pixels)this.scratch.width=this.scratch.height=pixels;
  const ctx=this.scratch.getContext('2d')!;
  for(const tile of dirty){
   render(ctx,tile.items);
   target.clearRect(tile.x,tile.y,tile.width,tile.height);
   target.drawImage(this.scratch,tile.x,tile.y,tile.width,tile.height,tile.x,tile.y,tile.width,tile.height);
  }
 }
}
