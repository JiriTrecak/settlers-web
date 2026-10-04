import type {WorldEditor} from '../world/worldEditor';
import type {ProceduralLayer} from '../../shared/authoring/layers';
import {sampleBezier} from '../../shared/authoring/shapes';
import {perf} from '../../debug/performance';
const ns='http://www.w3.org/2000/svg';
/** Screen-space handles edit the horizontal shape only. Elevation remains an explicit knot field. */
export class ShapeOverlay{
 private svg=document.createElementNS(ns,'svg');private frame=0;private epoch:unknown[]=[];private cursorEpoch:unknown[]=[];private stopped=false;
 private geometry=document.createElementNS(ns,'g');private cursor=document.createElementNS(ns,'circle');
 private mask:SVGMaskElement|null=null;private maskShape:ProceduralLayer['shape']|null=null;
 private maskWorld=false;private maskFill:SVGRectElement|null=null;
 private maskBounds=[Infinity,Infinity,-Infinity,-Infinity];
 private maskStrokes:{line:SVGPolylineElement;count:number;points:string;dot:string}[]=[];
 private selectedHistory:WorldEditor['layers']|null=null;private selectedRevision=-1;private selectedId:string|undefined;private selectedLayer:ProceduralLayer|undefined;
 private drag:{layer:ProceduralLayer;index:number;part:'point'|'incoming'|'outgoing';pointer:number}|null=null;
 constructor(private host:HTMLElement,private editor:WorldEditor,private report:(message:string)=>void){
  this.svg.style.cssText='position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:8';this.svg.setAttribute('aria-label','Shape control points');host.append(this.svg);this.svg.append(this.geometry,this.cursor);this.cursor.setAttribute('fill','none');this.cursor.setAttribute('stroke-width','2');this.cursor.style.display='none';
  this.svg.addEventListener('pointermove',e=>this.move(e));this.svg.addEventListener('pointerup',e=>this.end(e));this.svg.addEventListener('pointercancel',()=>{this.drag=null;this.epoch=[];this.cursorEpoch=[];});
  const tick=()=>{if(this.stopped)return;this.update();this.frame=requestAnimationFrame(tick);};this.frame=requestAnimationFrame(tick);
 }
 private update(){
  if(this.drag)return;
  const editor=this.editor,view=editor.view(),rect=this.host.getBoundingClientRect();
  const projection=[view.x,view.z,view.gameCam,view.zoom,view.gameZoom,view.yaw,view.pitch,rect.left,rect.top,this.host.clientWidth,this.host.clientHeight,editor.layers.revision,editor.shapeTerrain];
  const history=editor.layers,id=history.selection?.kind==='layer'?history.selection.id:undefined;
  // History.scene deliberately returns a defensive clone. Read it only when the
  // document or selection changes, never in every animation frame.
  if(history!==this.selectedHistory||history.revision!==this.selectedRevision||id!==this.selectedId){
   this.selectedHistory=history;this.selectedRevision=history.revision;this.selectedId=id;
   this.selectedLayer=id?history.scene.layers.find(l=>l.id===id):undefined;
  }
  const layer=editor.paintPreview??this.selectedLayer;
  const key=[...projection,layer,editor.paintPreviewRevision];
  if(key.some((value,i)=>value!==this.epoch[i])||key.length!==this.epoch.length){
   const reproject=projection.some((value,i)=>value!==this.epoch[i]);
   this.epoch=key;
   const started=perf.start();try{this.render(layer,reproject);}finally{perf.end('Editor shape overlay',started);}
  }
  const cursor=editor.layerCursor,cursorKey=[...projection,layer,editor.isPaintingLayer,cursor?.x,cursor?.z,editor.layerBrushSize,editor.layerBrushOperation];
  if(cursorKey.some((value,i)=>value!==this.cursorEpoch[i])||cursorKey.length!==this.cursorEpoch.length){this.cursorEpoch=cursorKey;this.renderCursor(layer);}
 }
 private screen(p:{x:number;z:number}){const rect=this.host.getBoundingClientRect(),s=this.editor.shapeScreenPoint(p.x,p.z);return s?{x:s.x-rect.left,y:s.y-rect.top}:null;}
 private renderCursor(layer:ProceduralLayer|undefined){
  const cursor=this.editor.layerCursor;
  this.cursor.style.display='none';
  if(!layer||layer.locked||layer.shape.type!=='mask'||!this.editor.isPaintingLayer||!cursor||this.editor.view().pitch<Math.PI/2-.001)return;
  const a=this.screen(cursor),b=this.screen({x:cursor.x+this.editor.layerBrushSize/2,z:cursor.z});if(!a||!b)return;
  this.cursor.setAttribute('cx',String(a.x));this.cursor.setAttribute('cy',String(a.y));this.cursor.setAttribute('r',String(Math.hypot(a.x-b.x,a.y-b.y)));this.cursor.setAttribute('stroke',this.editor.layerBrushOperation==='add'?'#adffd9':'#ffaca8');this.cursor.style.display='';

 }
 private render(layer:ProceduralLayer|undefined,reproject=true){
  const view=this.editor.view(),visible=layer&&!layer.locked&&view.pitch>=Math.PI/2-.001;
  const world=!!visible&&layer.shape.type==='mask'&&!view.gameCam&&Math.abs(view.pitch-Math.PI/2)<1e-8;
  if((reproject&&!world)||!visible||layer.shape!==this.maskShape||world!==this.maskWorld){this.geometry.replaceChildren();this.geometry.setAttribute('transform','');this.mask=null;this.maskShape=null;this.maskStrokes=[];this.maskFill=null;this.maskBounds=[Infinity,Infinity,-Infinity,-Infinity];}
  this.maskWorld=world;
  if(!visible)return;
  const rect=this.host.getBoundingClientRect(),project=this.editor.shapeScreenProjector(),screen=(p:{x:number;z:number})=>{const s=project(p.x,p.z);return s?{x:s.x-rect.left,y:s.y-rect.top}:null;};
  const line=(points:{x:number;z:number}[],color:string,dash=false)=>{const el=document.createElementNS(ns,'polyline');el.setAttribute('points',points.map(screen).filter(p=>p!==null).map(p=>`${p.x},${p.y}`).join(' '));el.setAttribute('fill','none');el.setAttribute('stroke',color);el.setAttribute('stroke-width','2');if(dash)el.setAttribute('stroke-dasharray','4 4');this.geometry.append(el);};
  const shape=layer.shape;
  if(shape.type==='mask'){
   let viewport:number[]|undefined;
   // Exact overhead orthographic projection is affine in X/Z. Keep the ordered
   // CSG strokes in map coordinates; panning/zooming only updates one SVG matrix.
   // Oblique/perspective previews retain per-point terrain projection below.
   if(world){
    const o=screen({x:view.x,z:view.z}),x=screen({x:view.x+1,z:view.z}),z=screen({x:view.x,z:view.z+1});
    if(!o||!x||!z)return;
    const a=x.x-o.x,b=x.y-o.y,c=z.x-o.x,d=z.y-o.y;
    const tx=o.x-a*view.x-c*view.z,ty=o.y-b*view.x-d*view.z,det=a*d-b*c;
    if(Math.abs(det)<1e-12)return;
    this.geometry.setAttribute('transform',`matrix(${a} ${b} ${c} ${d} ${tx} ${ty})`);
    // Clip the SVG mask surface to the viewport (plus an antialias margin),
    // rather than allocating a map-sized offscreen surface at close zoom.
    viewport=[Infinity,Infinity,-Infinity,-Infinity];
    for(const sx of [-2,this.host.clientWidth+2])for(const sy of [-2,this.host.clientHeight+2]){
     const wx=(d*(sx-tx)-c*(sy-ty))/det,wz=(-b*(sx-tx)+a*(sy-ty))/det;
     viewport[0]=Math.min(viewport[0]!,wx);viewport[1]=Math.min(viewport[1]!,wz);viewport[2]=Math.max(viewport[2]!,wx);viewport[3]=Math.max(viewport[3]!,wz);
    }
   }
   const strokePoint=world?(p:{x:number;z:number})=>({x:p.x,y:p.z}):screen;
   if(!this.mask){
    const mask=document.createElementNS(ns,'mask');mask.id='layer-paint-mask';mask.setAttribute('maskUnits','userSpaceOnUse');mask.setAttribute('x','0');mask.setAttribute('y','0');mask.setAttribute('width',String(this.host.clientWidth));mask.setAttribute('height',String(this.host.clientHeight));
    const defs=document.createElementNS(ns,'defs');defs.append(mask);this.geometry.append(defs);const fill=document.createElementNS(ns,'rect');fill.setAttribute('width','100%');fill.setAttribute('height','100%');fill.setAttribute('fill','#7de7c0');fill.setAttribute('fill-opacity','.2');fill.setAttribute('mask','url(#layer-paint-mask)');this.geometry.append(fill);
    this.mask=mask;this.maskShape=shape;this.maskFill=fill;
   }
   // A live stroke only appends points. Replacements and undo discard cached
   // strokes; overhead view changes retain their ordered add/subtract geometry.
   for(let i=0;i<shape.strokes.length;i++){
    const stroke=shape.strokes[i]!;let cached=this.maskStrokes[i];
    if(!cached){
     const p=stroke.points[0];if(!p)continue;const a=strokePoint(p),b=strokePoint({x:p.x+stroke.radius,z:p.z});if(!a||!b)continue;
     const line=document.createElementNS(ns,'polyline');line.setAttribute('fill','none');line.setAttribute('stroke',stroke.operation==='add'?'white':'black');line.setAttribute('stroke-width',String(2*Math.hypot(b.x-a.x,b.y-a.y)));line.setAttribute('stroke-linecap','round');line.setAttribute('stroke-linejoin','round');this.mask.append(line);
     cached={line,count:0,points:'',dot:` ${a.x+.01},${a.y}`};this.maskStrokes[i]=cached;
    }
    if(cached.count===stroke.points.length)continue;
    const addedPoints=stroke.points.slice(cached.count);
    if(world)for(const p of addedPoints){this.maskBounds[0]=Math.min(this.maskBounds[0]!,p.x-stroke.radius);this.maskBounds[1]=Math.min(this.maskBounds[1]!,p.z-stroke.radius);this.maskBounds[2]=Math.max(this.maskBounds[2]!,p.x+stroke.radius+.01);this.maskBounds[3]=Math.max(this.maskBounds[3]!,p.z+stroke.radius);}
    const added=addedPoints.map(strokePoint).filter(p=>p!==null).map(p=>`${p.x},${p.y}`).join(' ');
    cached.points+=(cached.points&&added?' ':'')+added;cached.count=stroke.points.length;
    cached.line.setAttribute('points',cached.points+(cached.count===1?cached.dot:''));
   }
   if(world&&viewport){const x=Math.max(this.maskBounds[0]!,viewport[0]!),y=Math.max(this.maskBounds[1]!,viewport[1]!),right=Math.min(this.maskBounds[2]!,viewport[2]!),bottom=Math.min(this.maskBounds[3]!,viewport[3]!),valid=Number.isFinite(x);for(const element of [this.mask,this.maskFill])if(element){element.setAttribute('x',String(valid?x:0));element.setAttribute('y',String(valid?y:0));element.setAttribute('width',String(valid?Math.max(0,right-x):0));element.setAttribute('height',String(valid?Math.max(0,bottom-y):0));}}
   return;
  }
  line(shape.type==='region'?[...shape.points,shape.points[0]!]:sampleBezier(shape.knots),'#f5d276');
  const handle=(p:{x:number;z:number},index:number,part:'point'|'incoming'|'outgoing')=>{
   const s=screen(p);if(!s)return;const circle=document.createElementNS(ns,'circle');circle.setAttribute('cx',String(s.x));circle.setAttribute('cy',String(s.y));circle.setAttribute('r',part==='point'?'7':'5');circle.setAttribute('fill',part==='point'?'#f5d276':'#8fd5ee');circle.setAttribute('stroke','#222');circle.setAttribute('stroke-width','2');circle.style.pointerEvents='auto';circle.style.cursor='grab';circle.setAttribute('role','button');circle.setAttribute('aria-label',`${part==='point'?'Anchor':part+' handle'} ${index+1}`);
   circle.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();this.drag={layer:structuredClone(layer),index,part,pointer:e.pointerId};this.svg.setPointerCapture(e.pointerId);});this.geometry.append(circle);
  };
  if(shape.type==='region')shape.points.forEach((p,i)=>handle(p,i,'point'));else shape.knots.forEach((p,i)=>{for(const key of ['incoming','outgoing']as const){const h=p[key];if(h){line([p,h],'#8fd5ee',true);handle(h,i,key);}}handle(p,i,'point');});
 }
 private move(e:PointerEvent){const d=this.drag;if(!d||d.pointer!==e.pointerId)return;const hit=this.editor.shapeWorldPoint(e.clientX,e.clientY);if(!hit)return;const shape=d.layer.shape;if(shape.type==='mask')return;
  if(shape.type==='region')shape.points[d.index]={x:hit.x,z:hit.z};else{const knot=shape.knots[d.index]!;if(d.part==='point'){const dx=hit.x-knot.x,dz=hit.z-knot.z;knot.x=hit.x;knot.z=hit.z;for(const key of ['incoming','outgoing']as const)if(knot[key]){knot[key]!.x+=dx;knot[key]!.z+=dz;}}else knot[d.part]={x:hit.x,z:hit.z};}
  this.render(d.layer);this.editor.previewLayerShape(shape);
 }
 private end(e:PointerEvent){const d=this.drag;if(!d||d.pointer!==e.pointerId)return;this.drag=null;this.epoch=[];this.cursorEpoch=[];try{const pending=this.editor.putLayer(d.layer);if(pending)void pending.then(()=>{if(!this.stopped)this.report('');},error=>{if(!this.stopped)this.report(error instanceof Error?error.message:String(error));});else this.report('');}catch(error){this.report(error instanceof Error?error.message:String(error));}}
 destroy(){this.stopped=true;cancelAnimationFrame(this.frame);this.svg.remove();}
}
