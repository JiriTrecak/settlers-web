import {Vector3,type Camera,type Object3D} from 'three';

/** Native-resolution text anchored to the world; never rasterized into the scene buffer. */
export class MineLabels {
 private root:HTMLDivElement|null=null;
 private readonly labels=new Map<Object3D,{element:HTMLDivElement;key:string}>();
 private readonly point=new Vector3();
 update(anchor:Object3D,workers:number,recommended:number):void {
  let label=this.labels.get(anchor);
  if(!label){
   const element=document.createElement('div');element.className='base-workforce-label';
   element.style.cssText='position:absolute;left:0;top:0;white-space:nowrap;padding:4px 10px;border:1px solid #8d9991;border-radius:4px;background:#091016df;color:#f2dfb1;font:600 13px/18px system-ui;pointer-events:none;box-sizing:border-box;';
   label={element,key:''};this.labels.set(anchor,label);this.root?.append(element);
  }
  const key=`${workers}/${recommended}`;
  if(key!==label.key){label.key=key;label.element.textContent=`Workers ${key}`;label.element.style.borderColor=workers>=recommended?'#daa856':'#8d9991';}
 }
 present(camera:Camera,canvas:HTMLCanvasElement):void {
  if(!this.labels.size)return;
  if(!this.root){
   this.root=document.createElement('div');this.root.className='world-labels';
   this.root.style.cssText='position:fixed;pointer-events:none;overflow:hidden;';
   canvas.parentElement?.append(this.root);
   for(const label of this.labels.values())this.root.append(label.element);
  }
  const rect=canvas.getBoundingClientRect();
  this.root.style.left=`${rect.left}px`;this.root.style.top=`${rect.top}px`;
  this.root.style.width=`${rect.width}px`;this.root.style.height=`${rect.height}px`;
  for(const [anchor,{element}] of this.labels){
   let visible=canvas.isConnected&&rect.width>0&&rect.height>0;
   for(let o:Object3D|null=anchor;o&&visible;o=o.parent)visible=o.visible;
   if(visible){
    anchor.getWorldPosition(this.point).project(camera);
    visible=Number.isFinite(this.point.x)&&this.point.z>=-1&&this.point.z<=1&&Math.abs(this.point.x)<=1&&Math.abs(this.point.y)<=1;
    if(visible){
     const x=Math.round((this.point.x+1)*rect.width/2),y=Math.round((1-this.point.y)*rect.height/2);
     element.style.transform=`translate(${x}px,${y}px) translate(-50%,-100%)`;
    }
   }
   element.hidden=!visible;
  }
 }
 remove(anchor:Object3D):void{this.labels.get(anchor)?.element.remove();this.labels.delete(anchor);}
 dispose():void{this.root?.remove();this.root=null;this.labels.clear();}
}
