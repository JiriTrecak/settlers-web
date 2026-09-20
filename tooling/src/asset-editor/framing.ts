import {Box3,Vector3} from 'three';

/** Fit the projected box, including tall/narrow models, instead of guessing a zoom by type. */
export function frameModel(bounds:Box3,aspect:number,yaw:number,pitch:number){
 if(bounds.isEmpty())return undefined;
 const center=bounds.getCenter(new Vector3()),half=bounds.getSize(new Vector3()).multiplyScalar(.5);
 const right=new Vector3(Math.cos(yaw),0,-Math.sin(yaw));
 const up=new Vector3(-Math.sin(yaw)*Math.sin(pitch),Math.cos(pitch),-Math.cos(yaw)*Math.sin(pitch));
 const extent=(axis:Vector3)=>Math.abs(axis.x)*half.x+Math.abs(axis.y)*half.y+Math.abs(axis.z)*half.z;
 return {x:center.x,z:center.z,height:center.y,zoom:Math.max(1,extent(up),extent(right)/Math.max(.1,aspect))*1.25};
}
