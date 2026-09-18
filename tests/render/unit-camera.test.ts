import {describe,it,expect} from 'vitest';
import {Vector3,PerspectiveCamera,Mesh,BoxGeometry,MeshBasicMaterial} from 'three';
import {Camera} from '../../src/render/camera/camera';
import {unitCameraPose,viewRotation} from '../../src/render/camera/unitCamera';
import {firstPersonBody} from '../../src/render/camera/firstPersonBody';
import {nextCameraMode} from '../../src/shared/camera/modes';
const subject={position:new Vector3(30,12,40),yaw:Math.PI/2,eyeHeight:1.8,eyeForward:.15,distance:7};
describe('unit views',()=>{
 it('cycles views without changing the subject',()=>{expect(nextCameraMode('rts')).toBe('third-person');expect(nextCameraMode('third-person')).toBe('first-person');expect(nextCameraMode('first-person')).toBe('rts');});
 it('anchors first person to the raised deck and unit facing',()=>{
  const pose=unitCameraPose(subject,{entity:1,mode:'first-person'});
  expect(pose.eye.x).toBeCloseTo(30.15);expect(pose.eye.y).toBeCloseTo(13.8);
  expect(new Vector3(0,0,-1).applyQuaternion(viewRotation(pose.eye,pose.target)).x).toBeCloseTo(1);
 });
 it('trails the unit and can look at a second actor',()=>{
  const target=new Vector3(40,16,43),pose=unitCameraPose(subject,{entity:1,mode:'third-person'},target);
  expect(pose.eye.x).toBe(23);expect(pose.eye.y).toBeCloseTo(16.6);expect(pose.target).toEqual(target);
  expect(new Vector3(0,0,-1).applyQuaternion(viewRotation(pose.eye,pose.target)).distanceTo(target.clone().sub(pose.eye).normalize())).toBeLessThan(.00001);
 });
 it('restores the RTS focus and keeps horizontal minimap rays finite',()=>{
  const camera=new Camera();camera.setGame(true,256);camera.lookAt(100,100);const cam=new PerspectiveCamera();camera.applyTo(cam,1280,720);const before=cam.position.clone();
  camera.setClosePose(unitCameraPose(subject,{entity:1,mode:'first-person',transitionMs:0}),16);camera.applyTo(cam,1280,720);
  expect(cam.position.y).toBeCloseTo(13.8);expect(cam.near).toBe(.08);expect(cam.fov).toBe(68);
  for(const point of camera.viewGround(1280,720))for(const n of point)expect(Number.isFinite(n)).toBe(true);
  camera.panWorld(10,10);expect(camera.targetX).toBe(30);
  camera.setClosePose(null);camera.applyTo(cam,1280,720);expect(cam.position.distanceTo(before)).toBeLessThan(.0001);
 });
 it('hides only the viewed body color draw and restores shared materials',()=>{
  const material=new MeshBasicMaterial(),mesh=new Mesh(new BoxGeometry(),material);let hidden=true;
  const shadowHook=mesh.onBeforeShadow;firstPersonBody(mesh,()=>hidden);
  const args=[null,null,null,mesh.geometry,material,null] as unknown as Parameters<Mesh['onBeforeRender']>;
  mesh.onBeforeRender(...args);expect(material.colorWrite).toBe(false);expect(material.depthWrite).toBe(false);
  mesh.onAfterRender(...args);expect(material.colorWrite).toBe(true);expect(material.depthWrite).toBe(true);expect(mesh.onBeforeShadow).toBe(shadowHook);
  hidden=false;mesh.onBeforeRender(...args);expect(material.colorWrite).toBe(true);mesh.onAfterRender(...args);
 });
});
