type ScreenRect={left:number;bottom:number;width:number;height:number};
/** Map a DOM portrait into the renderer's logical viewport and physical render target. */
export function portraitViewport(rect:ScreenRect,canvas:ScreenRect,bufferWidth:number,bufferHeight:number,pixelRatio:number){
 const sx=bufferWidth/Math.max(1,canvas.width),sy=bufferHeight/Math.max(1,canvas.height);
 return {
  x:(rect.left-canvas.left)*sx/pixelRatio,y:(canvas.bottom-rect.bottom)*sy/pixelRatio,
  width:rect.width*sx/pixelRatio,height:rect.height*sy/pixelRatio,
  pixelWidth:Math.max(1,Math.round(rect.width*sx)),pixelHeight:Math.max(1,Math.round(rect.height*sy)),
 };
}
