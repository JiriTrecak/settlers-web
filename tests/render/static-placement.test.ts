import {expect,it} from 'vitest';
import {Box3,BoxGeometry,Group,Mesh,MeshStandardMaterial,MeshDepthMaterial,Bone,Vector2,Vector3,Quaternion,Object3D,Raycaster} from 'three';
import {FoliageWindLayer} from '../../src/render/prop/foliageWind';
import {staticPlacementFactory,updatePlacementWorld,placementBounds,visitPlacementMeshes,materializePlacement} from '../../src/render/prop/staticPlacement';

it('folds exporter groups into exact render transforms while sharing geometry, UVs and materials',()=>{
 const prototype=new Group(),pivot=new Group(),orientation=new Group();
 orientation.rotation.y=.7;orientation.scale.setScalar(1.7);pivot.position.set(-2,.4,1);
 prototype.add(orientation);orientation.add(pivot);
 const leaf=new Mesh(new BoxGeometry(),new MeshStandardMaterial());leaf.rotation.x=.2;leaf.position.y=3;
 leaf.castShadow=true;leaf.customDepthMaterial=new MeshDepthMaterial();leaf.userData.sourceTreeWind=true;
 pivot.add(leaf);prototype.userData.dew=[0,1,2,.01];prototype.userData.variant='snow';
 const original=prototype.clone(),create=staticPlacementFactory(prototype),flat=create();
 for(const root of [original,flat]){root.position.set(12,4,9);root.rotation.y=1.2;root.scale.set(2,1,3);root.updateMatrixWorld(true);}
 const expected:Mesh[]=[];original.traverse(n=>{if(n instanceof Mesh)expected.push(n);});
 expect(flat.children).toHaveLength(1);const actual=flat.children[0] as Mesh;
 actual.matrixWorld.elements.forEach((n,i)=>expect(n).toBeCloseTo(expected[0].matrixWorld.elements[i],12));
 expect(actual.geometry).toBe(leaf.geometry);expect(actual.material).toBe(leaf.material);
 expect(actual.customDepthMaterial).toBe(leaf.customDepthMaterial);expect(actual.castShadow).toBe(true);
 expect(actual.userData.sourceTreeWind).toBe(true);expect(flat.userData.variant).toBe('snow');
 const a=new Box3().setFromObject(original,true),b=new Box3().setFromObject(flat,true);
 expect(a.min.distanceTo(b.min)).toBeLessThan(1e-12);expect(a.max.distanceTo(b.max)).toBeLessThan(1e-12);
 flat.userData.stamp='first';expect(create().userData.stamp).toBeUndefined();
 expect(prototype.children[0]).toBe(orientation);
});

it('keeps bones and their hierarchy intact instead of flattening animated structure',()=>{
 const root=new Group(),bone=new Bone();bone.add(new Mesh(new BoxGeometry(),new MeshStandardMaterial()));root.add(bone);
 expect(staticPlacementFactory(root)().children[0]).toBeInstanceOf(Bone);
 expect(staticPlacementFactory(root,true)().children[0]).toBeInstanceOf(Bone);
});

it('preserves hidden exporter branches after flattening',()=>{
 const root=new Group(),hidden=new Group();hidden.visible=false;
 hidden.add(new Mesh(new BoxGeometry(),new MeshStandardMaterial()));root.add(hidden);
 expect(staticPlacementFactory(root)().children[0].visible).toBe(false);
});

it('stores compact instance transforms and bounds exactly and materializes only for inspection',()=>{
 const prototype=new Group(),pivot=new Group();pivot.position.set(.7,2,-1);pivot.rotation.set(.1,.3,.2);prototype.add(pivot);
 const first=new Mesh(new BoxGeometry(1,3,2),new MeshStandardMaterial()),second=first.clone();
 second.position.set(2,-.5,4);second.scale.set(-1,2,.5);first.layers.set(2);first.renderOrder=3;first.customDepthMaterial=new MeshDepthMaterial();
 pivot.add(first,second);
 const flat=staticPlacementFactory(prototype)(),create=staticPlacementFactory(prototype,true),compact=create();
 const stored:unknown[]=[];visitPlacementMeshes(compact,(_mesh,world)=>stored.push(world));
 for(let i=0;i<3;i++){
  for(const root of [flat,compact]){root.position.set(12+i,4-i,9);root.rotation.set(.2,i*.4,.3,'ZXY');root.scale.set(-2,1+i*.5,3);updatePlacementWorld(root);}
  const actual:Mesh[]=[];visitPlacementMeshes(compact,(mesh,matrix)=>{actual.push(mesh);expect(matrix.elements).toEqual(flat.children[actual.length-1].matrixWorld.elements);expect(matrix).toBe(stored[actual.length-1]);});
  expect(placementBounds(compact)).toEqual(new Box3().setFromObject(flat));expect(compact.children).toHaveLength(0);
 }
 materializePlacement(compact);expect(compact.children).toHaveLength(2);
 expect((compact.children[0] as Mesh).geometry).toBe(first.geometry);expect((compact.children[0] as Mesh).customDepthMaterial).toBe(first.customDepthMaterial);
 expect(compact.children[0].layers.mask).toBe(first.layers.mask);expect(compact.children[0].renderOrder).toBe(3);
 expect(new Box3().setFromObject(materializePlacement(compact),true)).toEqual(new Box3().setFromObject(flat,true));
 materializePlacement(compact);expect(compact.children).toHaveLength(2);expect(create().children).toHaveLength(0);
 compact.position.x+=12;updatePlacementWorld(compact);
 visitPlacementMeshes(compact,(_mesh,matrix)=>expect(compact.children.some(child=>child.matrixWorld.equals(matrix))).toBe(true));
});

it('bounds shader motion through nested nonuniform scales, negative scales and shear without changing pick bounds',()=>{
 const wind=new FoliageWindLayer(),prototype=new Group(),pivot=new Group();
 pivot.rotation.set(.3,.7,.5);pivot.scale.set(2,1,.4);prototype.add(pivot);
 const mesh=new Mesh(new BoxGeometry(2,4,1),new MeshStandardMaterial());mesh.rotation.set(.8,.2,.6);pivot.add(mesh);
 const detach=wind.attach(prototype,{amplitude:.5,speed:1},4,{value:new Vector2()});
 const compact=staticPlacementFactory(prototype,true)();compact.scale.set(-3,2,.5);compact.rotation.set(.2,.4,.7);compact.position.set(40,2,30);updatePlacementWorld(compact);
 const render=new Box3(),pick=placementBounds(compact,undefined,render);
 expect(pick).toEqual(placementBounds(compact));expect(compact.children).toHaveLength(0);
 // Exercise the entire declared displacement envelope, including directions
 // that max-column-scale padding misses when exporter transforms contain shear.
 visitPlacementMeshes(compact,(part,world)=>{
  const bounds=part.userData.foliageMotionBounds;
  const positions=part.geometry.getAttribute('position'),local=new Vector3(),direction=new Vector3(),point=new Vector3();
  for(let i=0;i<positions.count;i++)for(let a=0;a<32;a++){
   local.fromBufferAttribute(positions,i);
   direction.set(Math.sin(a*2.3),Math.cos(a*.7),Math.sin(a*.9)).normalize();
   point.copy(local).addScaledVector(direction,bounds.local).applyMatrix4(world);
   point.addScaledVector(direction,bounds.world);
   expect(render.containsPoint(point)).toBe(true);
  }
 });
 materializePlacement(compact);const copied=compact.children[0] as Mesh;
 expect(copied.userData.foliageMotionBounds).toEqual(mesh.userData.foliageMotionBounds);
 detach();wind.dispose();mesh.geometry.dispose();(mesh.material as MeshStandardMaterial).dispose();
});

it('preserves source quaternions, subsequent Euler edits and ray hits without eagerly allocating a scene node',()=>{
 const prototype=new Group();prototype.add(new Mesh(new BoxGeometry(2,3,4),new MeshStandardMaterial()));
 const ordinary=staticPlacementFactory(prototype)(),compact=staticPlacementFactory(prototype,true)();
 expect(compact).not.toBeInstanceOf(Object3D);expect(compact.children).toHaveLength(0);
 const source=new Quaternion().setFromAxisAngle(new Vector3(1,2,3).normalize(),1.1).toArray();
 for(const root of [ordinary,compact]){
  root.position.set(14,3,25);root.scale.set(-2,.5,3);
  root.rotation.set(.1,.2,.3,'ZXY');root.quaternion.fromArray(source);updatePlacementWorld(root);
 }
 expect(compact.rotation.toArray()).toEqual(ordinary.rotation.toArray());
 expect(compact.matrixWorld.elements).toEqual(ordinary.matrixWorld.elements);
 const inspected=materializePlacement(compact),ray=new Raycaster(new Vector3(14,30,25),new Vector3(0,-1,0));
 expect(ray.intersectObject(inspected,true).map(h=>h.point)).toEqual(ray.intersectObject(ordinary,true).map(h=>h.point));
 for(const root of [ordinary,compact]){root.rotation.y+=.4;root.position.x+=2;updatePlacementWorld(root);}
 expect(materializePlacement(compact)).toBe(inspected);
 expect(inspected.matrixWorld.elements).toEqual(ordinary.matrixWorld.elements);
 expect(inspected.children[0].matrixWorld.elements).toEqual(ordinary.children[0].matrixWorld.elements);
 expect(placementBounds(compact)).toEqual(new Box3().setFromObject(ordinary));
});
