import {expect,it} from 'vitest';
import {AdditiveBlending,Group,Matrix4,Mesh,MeshBasicMaterial,PerspectiveCamera,PlaneGeometry,Scene,Sprite,SpriteMaterial,Vector3} from 'three';
import {ParticleBatch,bindParticleBatches} from '../../src/render/abilities/particleBatch';
it('updates buffers at the scene boundary, before draw-list uploads, and restores the scene hook',()=>{
 const scene=new Scene(),camera=new PerspectiveCamera(),owner={},p=new Sprite(new SpriteMaterial()),batch=new ParticleBatch([p]);scene.add(batch.mesh);
 let called=0;const previous:Scene['onBeforeRender']=()=>{called++;};scene.onBeforeRender=previous;
 try{
  bindParticleBatches(scene,owner,[batch]);p.position.x=12;
  scene.onBeforeRender(null as never,scene,camera,null as never,null as never,null as never);
  const matrix=new Matrix4();batch.mesh.getMatrixAt(0,matrix);expect(matrix.elements[12]).toBe(12);expect(called).toBe(1);
  expect(batch.mesh.instanceMatrix.version).toBeGreaterThan(0);
  bindParticleBatches(scene,owner,[]);expect(scene.onBeforeRender).toBe(previous);
 }finally{bindParticleBatches(scene,owner,[]);batch.dispose();p.material.dispose();}
});
it('batches independent particle transforms, colours and opacity, compacting invisible particles',()=>{
 const particles=Array.from({length:32},(_,i)=>{const p=new Mesh(new PlaneGeometry(1,1),new MeshBasicMaterial({color:i%2?'red':'blue',opacity:i/32,blending:AdditiveBlending}));p.position.set(i,2,3);p.scale.setScalar(i+1);return p;});
 const batch=new ParticleBatch(particles),root=new Group(),camera=new PerspectiveCamera();root.add(batch.mesh);root.position.set(40,0,0);camera.position.set(0,10,20);camera.lookAt(0,0,0);camera.updateMatrixWorld();
 try{
  particles[3].visible=false;batch.sync(camera);expect(batch.mesh.count).toBe(30);
  const matrix=new Matrix4();batch.mesh.getMatrixAt(0,matrix);expect(new Vector3().setFromMatrixPosition(matrix).toArray()).toEqual([1,2,3]);
  expect(batch.mesh.geometry.getAttribute('effectOpacity').getX(0)).toBeCloseTo(1/32);
  particles[1].position.x=200;particles[1].material.opacity=.8;batch.sync(camera);batch.mesh.getMatrixAt(0,matrix);expect(matrix.elements[12]).toBe(200);expect(batch.mesh.geometry.getAttribute('effectOpacity').getX(0)).toBeCloseTo(.8);
 }finally{batch.dispose();for(const p of particles){p.geometry.dispose();p.material.dispose();}}
});
it('preserves camera-facing sprite orientation under transformed parents and sorts normal alpha',()=>{
 const root=new Group();root.position.set(10,2,-3);root.rotation.y=.7;root.scale.setScalar(2);
 const camera=new PerspectiveCamera();camera.position.set(0,0,20);camera.lookAt(0,0,0);camera.updateMatrixWorld();
 const sprites=[-2,2].map(z=>{const p=new Sprite(new SpriteMaterial());p.position.set(0,0,z);return p;});const batch=new ParticleBatch(sprites);root.add(batch.mesh);
 try{batch.sync(camera);expect(batch.mesh.count).toBe(2);const matrix=new Matrix4();batch.mesh.getMatrixAt(0,matrix);matrix.premultiply(root.matrixWorld);
  expect(new Vector3().setFromMatrixPosition(matrix).distanceTo(sprites[0].position.clone().applyMatrix4(root.matrixWorld))).toBeLessThan(.00001);
  expect(new Vector3().setFromMatrixColumn(matrix,2).normalize().distanceTo(new Vector3(0,0,1))).toBeLessThan(.00001);
 }finally{batch.dispose();for(const p of sprites)p.material.dispose();}
});
