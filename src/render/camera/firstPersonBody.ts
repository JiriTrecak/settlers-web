import {Mesh,type Object3D,type Material} from 'three';
/** Suppress only the color/depth draw of the viewed body. Shadow passes use
 * onBeforeShadow, so the unit still casts its normal animated shadow.
 * Restore shared materials after each draw: teammates/portraits are unaffected. */
export function firstPersonBody(root:Object3D,hidden:()=>boolean):void {
 root.traverse(object=>{
  if(!(object instanceof Mesh))return;
  const before=object.onBeforeRender,after=object.onAfterRender;
  let saved:{material:Material;color:boolean;depth:boolean}|undefined;
  object.onBeforeRender=function(...args){
   before.apply(this,args);
   if(hidden()){const material=args[4];saved={material,color:material.colorWrite,depth:material.depthWrite};material.colorWrite=false;material.depthWrite=false;}
  };
  object.onAfterRender=function(...args){
   if(saved){saved.material.colorWrite=saved.color;saved.material.depthWrite=saved.depth;saved=undefined;}
   after.apply(this,args);
  };
 });
}
