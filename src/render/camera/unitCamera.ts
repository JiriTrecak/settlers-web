import {Quaternion,Vector3} from 'three';
import type {UnitCameraMode} from '../../shared/camera/modes';
export type CameraSubject={position:Vector3;yaw:number;eyeHeight:number;eyeForward:number;distance:number};
export type UnitShot={mode:Exclude<UnitCameraMode,'rts'>;entity:number;lookAt?:number;distance?:number;height?:number;fov?:number;transitionMs?:number};
export type ClosePose={eye:Vector3;target:Vector3;focus:Vector3;fov:number;key:string;transitionMs:number};
/** World-space pose derived from the same transform used to draw the unit. */
export function unitCameraPose(subject:CameraSubject,shot:UnitShot,lookAt?:Vector3):ClosePose {
 const forward=new Vector3(Math.sin(subject.yaw),0,Math.cos(subject.yaw));
 const focus=subject.position.clone().add(new Vector3(0,shot.height??subject.eyeHeight,0));
 const first=shot.mode==='first-person';
 const eye=first?focus.clone().addScaledVector(forward,subject.eyeForward):focus.clone().addScaledVector(forward,-(shot.distance??subject.distance)).add(new Vector3(0,(shot.distance??subject.distance)*.4,0));
 const target=lookAt?.clone()??focus.clone().addScaledVector(forward,first?8:2);
 if(target.distanceToSquared(eye)<.001)target.addScaledVector(forward,1);
 return {eye,target,focus,fov:shot.fov??(first?68:55),key:`${shot.mode}/${shot.entity}/${shot.lookAt??''}/${shot.fov??''}/${shot.height??''}/${shot.distance??''}`,transitionMs:shot.transitionMs??350};
}
export function viewRotation(eye:Vector3,target:Vector3):Quaternion {
 // Camera local -Z points towards the target.
 const direction=target.clone().sub(eye).normalize();
 const yaw=Math.atan2(-direction.x,-direction.z),pitch=Math.asin(Math.max(-1,Math.min(1,direction.y)));
 return new Quaternion().setFromAxisAngle(new Vector3(0,1,0),yaw).multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),pitch));
}
