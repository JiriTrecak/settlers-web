import type {WorldEditor} from '../world/worldEditor';
import type {ProceduralLayer} from '../../shared/authoring/layers';
import {sampleBezier} from '../../shared/authoring/shapes';
const ns='http://www.w3.org/2000/svg';
/** Screen-space handles edit the horizontal shape only. Elevation remains an explicit knot field. */
export class ShapeOverlay{
 private svg=document.createElementNS(ns,'svg');private frame=0;private epoch='';private stopped=false;
 private drag:{layer:ProceduralLayer;index:number;part:'point'|'incoming'|'outgoing';pointer:number}|null=null;
 constructor(private host:HTMLElement,private editor:WorldEditor,private report:(message:string)=>void){
  this.svg.style.cssText='position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:8';this.svg.setAttribute('aria-label','Shape control points');host.append(this.svg);
  this.svg.addEventListener('pointermove',e=>this.move(e));this.svg.addEventListener('pointerup',e=>this.end(e));this.svg.addEventListener('pointercancel',()=>{this.drag=null;this.epoch='';});
  const tick=()=>{if(this.stopped)return;const view=editor.view(),key=JSON.stringify([view,editor.layers.selection,editor.layers.revision,host.clientWidth,host.clientHeight]);if(!this.drag&&key!==this.epoch){this.epoch=key;const layer=editor.layers.scene.layers.find(l=>l.id===editor.layers.selection?.id);this.render(layer);}this.frame=requestAnimationFrame(tick);};this.frame=requestAnimationFrame(tick);
 }
 private render(layer:ProceduralLayer|undefined){
  this.svg.replaceChildren();if(!layer||layer.locked||this.editor.view().pitch<Math.PI/2-.001)return;
  const rect=this.host.getBoundingClientRect(),screen=(p:{x:number;z:number})=>{const s=this.editor.shapeScreenPoint(p.x,p.z);return s?{x:s.x-rect.left,y:s.y-rect.top}:null;};
  const line=(points:{x:number;z:number}[],color:string,dash=false)=>{const el=document.createElementNS(ns,'polyline');el.setAttribute('points',points.map(screen).filter(p=>p!==null).map(p=>`${p.x},${p.y}`).join(' '));el.setAttribute('fill','none');el.setAttribute('stroke',color);el.setAttribute('stroke-width','2');if(dash)el.setAttribute('stroke-dasharray','4 4');this.svg.append(el);};
  const shape=layer.shape;line(shape.type==='region'?[...shape.points,shape.points[0]!]:sampleBezier(shape.knots),'#f5d276');
  const handle=(p:{x:number;z:number},index:number,part:'point'|'incoming'|'outgoing')=>{
   const s=screen(p);if(!s)return;const circle=document.createElementNS(ns,'circle');circle.setAttribute('cx',String(s.x));circle.setAttribute('cy',String(s.y));circle.setAttribute('r',part==='point'?'7':'5');circle.setAttribute('fill',part==='point'?'#f5d276':'#8fd5ee');circle.setAttribute('stroke','#222');circle.setAttribute('stroke-width','2');circle.style.pointerEvents='auto';circle.style.cursor='grab';circle.setAttribute('role','button');circle.setAttribute('aria-label',`${part==='point'?'Anchor':part+' handle'} ${index+1}`);
   circle.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();this.drag={layer:structuredClone(layer),index,part,pointer:e.pointerId};this.svg.setPointerCapture(e.pointerId);});this.svg.append(circle);
  };
  if(shape.type==='region')shape.points.forEach((p,i)=>handle(p,i,'point'));else shape.knots.forEach((p,i)=>{for(const key of ['incoming','outgoing']as const){const h=p[key];if(h){line([p,h],'#8fd5ee',true);handle(h,i,key);}}handle(p,i,'point');});
 }
 private move(e:PointerEvent){const d=this.drag;if(!d||d.pointer!==e.pointerId)return;const hit=this.editor.shapeWorldPoint(e.clientX,e.clientY);if(!hit)return;const shape=d.layer.shape;
  if(shape.type==='region')shape.points[d.index]={x:hit.x,z:hit.z};else{const knot=shape.knots[d.index]!;if(d.part==='point'){const dx=hit.x-knot.x,dz=hit.z-knot.z;knot.x=hit.x;knot.z=hit.z;for(const key of ['incoming','outgoing']as const)if(knot[key]){knot[key]!.x+=dx;knot[key]!.z+=dz;}}else knot[d.part]={x:hit.x,z:hit.z};}
  this.render(d.layer);this.editor.previewLayerShape(shape);
 }
 private end(e:PointerEvent){const d=this.drag;if(!d||d.pointer!==e.pointerId)return;this.drag=null;this.epoch='';try{this.editor.putLayer(d.layer);this.report('');}catch(error){this.report(error instanceof Error?error.message:String(error));}}
 destroy(){this.stopped=true;cancelAnimationFrame(this.frame);this.svg.remove();}
}
