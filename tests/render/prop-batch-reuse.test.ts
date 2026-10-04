import {expect,it,vi} from 'vitest';
import {BoxGeometry,Group,Mesh,MeshStandardMaterial,Scene,Vector3,Matrix4,Raycaster,Box3,Frustum,Plane} from 'three';
import {PropField} from '../../src/render/prop/propField';
import {HeightField} from '../../src/shared/map/height';
it('keeps unchanged forest buffers and reuses capacity after a tree is removed',()=>{
 const scene=new Scene(),field=new PropField(scene,new Map()),geometry=new BoxGeometry(1,2,1),material=new MeshStandardMaterial();
 const internal=field as any;
 // Mirrors sync(): additions are marked changed, removals detach from their batch cell first.
 const add=(id:string,x:number)=>{const root=new Group();root.add(new Mesh(geometry,material));root.position.set(x,0,2);root.userData.asset='pine';internal.placed.set(id,root);internal.changed.add(id);};
 const remove=(id:string)=>{internal.detach(id,internal.placed.get(id));internal.placed.delete(id);};
 add('a',1);add('b',3);add('far',100);internal.rebuildBatches();
 const [near,far]=internal.batches,buffer=near.instanceMatrix.array,farVersion=far.instanceMatrix.version;
 // Untouched cells keep their batch objects; only the edited cell regroups (order is not part of the contract).
 internal.rebuildBatches();expect(internal.batches).toEqual([near,far]);expect(far.instanceMatrix.version).toBe(farVersion);
 remove('a');internal.rebuildBatches();
 expect(internal.batches).toContain(near);expect(near.instanceMatrix.array).toBe(buffer);expect(near.count).toBe(1);
 expect(near.userData.stampIds).toEqual(['b']);expect(internal.batches).toContain(far);expect(far.instanceMatrix.version).toBe(farVersion);
 const matrix=new Matrix4();near.getMatrixAt(0,matrix);expect(new Vector3().setFromMatrixPosition(matrix).x).toBe(3);
 let disposed=false;near.addEventListener('dispose',()=>disposed=true);remove('b');internal.rebuildBatches();expect(disposed).toBe(true);expect(internal.batches).toEqual([far]);
 field.destroy();geometry.dispose();material.dispose();expect(scene.children).toHaveLength(0);
});

it('publishes a mixed forest once after asynchronous model arrivals, with shared materials',async()=>{
 const field=new PropField(new Scene(),new Map()),internal=field as any;
 vi.spyOn(internal.referenceGround,'ready','get').mockReturnValue(Promise.resolve());
 const material=new MeshStandardMaterial(),geometry=new BoxGeometry(1,2,1);
 const prototype=()=>{const root=new Group();root.add(new Mesh(geometry,material));return root;};
 let resolveA!:(root:Group)=>void,resolveB!:(root:Group)=>void;
 internal.protos.set('pine#base',new Promise<Group>(resolve=>{resolveA=resolve;}));
 internal.protos.set('rock#base',new Promise<Group>(resolve=>{resolveB=resolve;}));
 field.sync([{id:'a',asset:'pine',x:1,y:1},{id:'b',asset:'pine',x:3,y:1},{id:'c',asset:'rock',x:5,y:1}]);
 await Promise.resolve();
 const rebuild=vi.spyOn(internal,'rebuildBatches');
 resolveA(prototype());await Promise.resolve();await Promise.resolve();
 expect(internal.placed.size).toBe(0);expect(rebuild).not.toHaveBeenCalled();
 resolveB(prototype());await field.ready();
 expect(internal.placed.size).toBe(3);expect(rebuild).toHaveBeenCalledTimes(1);
 expect(internal.placed.get('a').children).toHaveLength(0);expect(internal.placed.get('b').children).toHaveLength(0);
 expect(internal.batches.every((batch:any)=>batch.material===material)).toBe(true);
 field.setSelected('a');expect(internal.placed.get('a').children[0].material).toBe(material);
 expect(internal.placed.get('b').children).toHaveLength(0);
 field.destroy();
});

it('discards stale pending placements when a document changes or the renderer closes',async()=>{
 const field=new PropField(new Scene(),new Map()),internal=field as any;
 vi.spyOn(internal.referenceGround,'ready','get').mockReturnValue(Promise.resolve());
 let resolve!:(root:Group)=>void;
 internal.protos.set('pine#base',new Promise<Group>(done=>{resolve=done;}));
 field.sync([{id:'obsolete',asset:'pine',x:1,y:1}]);
 field.sync([{id:'current',asset:'pine',x:4,y:1}]);
 const root=new Group();root.add(new Mesh(new BoxGeometry(),new MeshStandardMaterial()));
 resolve(root);await field.ready();expect([...internal.placed.keys()]).toEqual(['current']);
 field.sync([{id:'after-close',asset:'pine',x:8,y:1}]);field.destroy();
 await field.ready();expect(internal.placed.size).toBe(0);
});

it('keeps dew buffers stable on tree harvest, but repacks actual dew additions, replacements and removals',async()=>{
 const field=new PropField(new Scene(),new Map()),internal=field as any;
 vi.spyOn(internal.referenceGround,'ready','get').mockReturnValue(Promise.resolve());
 for(const asset of ['pine','fern']){
  const root=new Group();root.add(new Mesh(new BoxGeometry(),new MeshStandardMaterial()));
  if(asset==='fern')root.userData.dew=[0,1,0,.1];
  internal.protos.set(`${asset}#base`,Promise.resolve(root));
 }
 const tree={id:'tree',asset:'pine',x:1,y:1},fern={id:'fern',asset:'fern',x:5,y:5},tree2={id:'tree2',asset:'pine',x:2,y:1};
 field.sync([tree,fern]);await field.ready();
 const dew=field.dew,revision=field.dewRevision;
 expect(dew.length).toBe(4);
 field.sync([fern]);await field.ready();
 expect(field.dew).toBe(dew);expect(field.dewRevision).toBe(revision);
 field.sync([fern,tree2]);await field.ready();
 expect(field.dew).toBe(dew);expect(field.dewRevision).toBe(revision);
 // Replacement under the same ID adds a new contributor.
 const fern2={...tree2,asset:'fern'};
 field.sync([fern,fern2]);await field.ready();
 expect(field.dew.length).toBe(8);expect(field.dewRevision).toBeGreaterThan(revision);
 expect([...field.dew.slice(0,4)]).toEqual([...dew]);
 const beforeMove=field.dew;
 field.sync([{...fern,x:8},fern2]);await field.ready();
 expect(field.dew[0]).toBe(8.5);expect(beforeMove[0]).toBe(5.5);
 expect([...field.dew.slice(4)]).toEqual([...beforeMove.slice(4)]);
 field.sync([tree,fern2]);await field.ready();
 expect([...field.dew]).toEqual([...beforeMove.slice(4)]);
 field.sync([tree]);await field.ready();expect(field.dew.length).toBe(0);
 field.destroy();
});

it('relifts only changed cells and leaves pinned scenery at its authored height',async()=>{
 const field=new PropField(new Scene(),new Map()),internal=field as any,root=new Group();
 vi.spyOn(internal.referenceGround,'ready','get').mockReturnValue(Promise.resolve());
 root.add(new Mesh(new BoxGeometry(),new MeshStandardMaterial()));
 internal.protos.set('pine#base',Promise.resolve(root));
 field.sync([{id:'near',asset:'pine',x:1,y:1},{id:'far',asset:'pine',x:100,y:1},{id:'pinned',asset:'pine',x:3,y:1,sourceTransform:{height:4,quaternion:[0,0,0,1]}}]);
 await field.ready();
 const before=new Map(internal.batches.map((b:any)=>[b,b.instanceMatrix.version]));
 field.setHeight(()=>0);await Promise.resolve();
 for(const [b,version] of before)expect((b as any).instanceMatrix.version).toBe(version);
 field.setHeight(x=>x<50?2:0);await Promise.resolve();
 expect(internal.placed.get('near').position.y).toBe(2);
 expect(internal.placed.get('far').position.y).toBe(0);
 expect(internal.placed.get('pinned').position.y).toBe(4);
 const far=internal.batches.find((b:any)=>b.userData.stampIds.includes('far'));
 expect(far.instanceMatrix.version).toBe(before.get(far));field.destroy();
});

it('refreshes coverage without resampling existing props, but samples new placements and terrain edits',async()=>{
 const field=new PropField(new Scene(),new Map()),internal=field as any,root=new Group();
 vi.spyOn(internal.referenceGround,'ready','get').mockReturnValue(Promise.resolve());
 const update=vi.spyOn(internal.referenceGround,'update').mockImplementation(()=>{});
 root.add(new Mesh(new BoxGeometry(),new MeshStandardMaterial()));
 internal.protos.set('pine#base',Promise.resolve(root));
 const existing={id:'near',asset:'pine',x:1,y:1};
 field.setHeight(()=>2);field.sync([existing]);await field.ready();
 const before=new Map(internal.batches.map((b:any)=>[b,b.instanceMatrix.version]));
 const unchanged=vi.fn(()=>2),coverage=new HeightField(16);
 field.setHeight(unchanged,coverage,true);await Promise.resolve();
 expect(update).toHaveBeenLastCalledWith(coverage);expect(unchanged).not.toHaveBeenCalled();
 expect(internal.placed.get('near').position.y).toBe(2);
 for(const [b,version] of before)expect((b as any).instanceMatrix.version).toBe(version);
 field.sync([existing,{id:'new',asset:'pine',x:5,y:5}]);await field.ready();
 expect(unchanged).toHaveBeenCalled();expect(internal.placed.get('new').position.y).toBe(2);
 const terrainEdit=vi.fn(()=>4);field.setHeight(terrainEdit);await Promise.resolve();
 expect(terrainEdit).toHaveBeenCalledTimes(2);
 expect(internal.placed.get('near').position.y).toBe(4);expect(internal.placed.get('new').position.y).toBe(4);
 field.destroy();
});

it('reindexes a committed drag even when its final pose was already previewed',async()=>{
 const field=new PropField(new Scene(),new Map()),internal=field as any,root=new Group();
 vi.spyOn(internal.referenceGround,'ready','get').mockReturnValue(Promise.resolve());
 root.add(new Mesh(new BoxGeometry(),new MeshStandardMaterial()));
 internal.protos.set('pine#base',Promise.resolve(root));
 const original={id:'dragged',asset:'pine',x:1,y:1},destination={...original,x:140,y:100};
 field.sync([original]);await field.ready();
 const oldCell=internal.placed.get('dragged').userData.batchCell,revision=field.dewRevision;
 field.previewStamp(destination);
 // Preview is lightweight and does not rebuild the forest or contacts.
 expect(field.dewRevision).toBe(revision);expect(internal.placed.get('dragged').userData.batchCell).toBe(oldCell);
 field.sync([destination]);await field.ready();
 expect(internal.placed.get('dragged').userData.batchCell).not.toBe(oldCell);
 expect(internal.members.get(oldCell)?.has('dragged')??false).toBe(false);
 expect(internal.placed.get('dragged').position.x).toBe(140.5);expect(internal.placed.get('dragged').position.z).toBe(100.5);
 const batch=internal.batches.find((b:any)=>b.userData.stampIds.includes('dragged'));
 expect(batch.userData.cell).toBe(internal.placed.get('dragged').userData.batchCell);
 const matrix=new Matrix4();batch.getMatrixAt(0,matrix);expect(new Vector3().setFromMatrixPosition(matrix).x).toBe(140.5);
 field.sync([original]);await field.ready();expect(internal.placed.get('dragged').userData.batchCell).toBe(oldCell);
 field.destroy();
});

it('retains exact camera obstruction and selection bounds with lazy static meshes',async()=>{
 const field=new PropField(new Scene(),new Map()),internal=field as any,prototype=new Group();
 vi.spyOn(internal.referenceGround,'ready','get').mockReturnValue(Promise.resolve());
 const mesh=new Mesh(new BoxGeometry(2,4,3),new MeshStandardMaterial());mesh.position.set(.2,2,-.1);mesh.rotation.z=.2;prototype.add(mesh);
 internal.protos.set('rock#base',Promise.resolve(prototype));
 field.sync([{id:'near',asset:'rock',x:2,y:3,yaw:.6,scale:2},{id:'far',asset:'rock',x:100,y:100}]);await field.ready();
 const near=internal.placed.get('near'),far=internal.placed.get('far');expect(near.children).toHaveLength(0);expect(far.children).toHaveLength(0);
 const reference=prototype.clone();reference.position.copy(near.position);reference.quaternion.copy(near.quaternion);reference.scale.copy(near.scale);reference.updateMatrixWorld(true);
 const ray=new Raycaster(new Vector3(2.5,3,25),new Vector3(0,0,-1),0,50);
 expect(field.cameraObstruction(ray)).toBeCloseTo(ray.intersectObject(reference,true)[0].distance,12);
 expect(near.children).toHaveLength(1);expect(far.children).toHaveLength(0);
 expect(field.boundsFor(['near'])).toEqual(new Box3().setFromObject(reference,true));
 const destination={id:'near',asset:'rock',x:20,y:3,yaw:1.2,scale:2};field.previewStamp(destination);
 const slot=internal.instanceSlots.get('near')[0],matrix=new Matrix4();slot.batch.getMatrixAt(slot.index,matrix);
 expect(matrix.elements).toEqual(Array.from(new Float32Array(near.children[0].matrixWorld.elements)));
 field.sync([destination,{id:'far',asset:'rock',x:100,y:100}]);await field.ready();
 expect(internal.placed.get('near')).toBe(near);expect(far.children).toHaveLength(0);field.destroy();
});

it('prunes distant cells while preserving exact pick and obstruction results, including drag previews',async()=>{
 const field=new PropField(new Scene(),new Map()),internal=field as any,prototype=new Group();
 vi.spyOn(internal.referenceGround,'ready','get').mockReturnValue(Promise.resolve());
 prototype.add(new Mesh(new BoxGeometry(2,4,3),new MeshStandardMaterial()));
 internal.protos.set('rock#base',Promise.resolve(prototype));
 const stamps=Array.from({length:2000},(_,i)=>({id:`rock.${i}`,asset:'rock',x:(i%50)*12,y:Math.floor(i/50)*12,yaw:(i%7)*.3}));
 field.sync(stamps);await field.ready();
 const distant=internal.placed.get('rock.1999'),readBounds=vi.fn(()=>{throw Error('Distant cell must be pruned before reading each prop');});
 Object.defineProperty(distant.userData,'cameraBounds',{configurable:true,get:readBounds});
 const ray=new Raycaster(new Vector3(.5,1,9),new Vector3(0,0,-1),0,12);
 const expected=ray.intersectObjects(internal.batches,false)[0];
 const queries=vi.spyOn(ray,'intersectObjects');
 expect(field.pick(ray)).toBe(expected.object.userData.stampIds[expected.instanceId!]);
 expect(queries.mock.calls[0][0].length).toBeLessThan(internal.batches.length/4);
 expect(field.cameraObstruction(ray)).toBeCloseTo(expected.distance,6);
 expect(readBounds).not.toHaveBeenCalled();
 // The dragged object still belongs to its old cell until commit.
 const moved={...stamps[0],x:800,y:800};field.previewStamp(moved);
 const movedRay=new Raycaster(new Vector3(800.5,1,809),new Vector3(0,0,-1),0,12);
 expect(field.pick(movedRay)).toBe('rock.0');expect(field.cameraObstruction(movedRay)).toBeLessThan(12);
 field.destroy();
});

it('finds an obstruction within a large containing bounds even when its exit is beyond ray far',async()=>{
 const field=new PropField(new Scene(),new Map()),internal=field as any,prototype=new Group();
 vi.spyOn(internal.referenceGround,'ready','get').mockReturnValue(Promise.resolve());
 const material=new MeshStandardMaterial();
 const near=new Mesh(new BoxGeometry(2,4,1),material),far=near.clone();far.position.z=100;const back=near.clone();back.position.z=-100;prototype.add(near,far,back);
 internal.protos.set('rock#base',Promise.resolve(prototype));field.sync([{id:'long',asset:'rock',x:0,y:0}]);await field.ready();
 const ray=new Raycaster(new Vector3(.5,1,5),new Vector3(0,0,-1),0,8);
 const expected=ray.intersectObjects(internal.batches,false)[0];
 expect(field.pick(ray)).toBe('long');expect(field.cameraObstruction(ray)).toBeCloseTo(expected.distance,6);
 field.destroy();
});

it('keeps scatter and shadow casters separate even with equal spatial cell sizes',async()=>{
 const scene=new Scene(),field=new PropField(scene,new Map(),undefined,{caster:48,scatter:48}),internal=field as any,prototype=new Group();
 vi.spyOn(internal.referenceGround,'ready','get').mockReturnValue(Promise.resolve());
 const mesh=new Mesh(new BoxGeometry(1,1,1),new MeshStandardMaterial());mesh.castShadow=true;prototype.add(mesh);
 internal.protos.set('plant#base',Promise.resolve(prototype));internal.bounds.set('plant',{minY:-.5,height:1});
 field.sync([{id:'low',asset:'plant',x:2,y:2,scale:.5},{id:'tall',asset:'plant',x:8,y:2,scale:2}]);await field.ready();
 expect(internal.batches).toHaveLength(2);
 const low=internal.batches.find((b:any)=>b.userData.stampIds.includes('low')),tall=internal.batches.find((b:any)=>b.userData.stampIds.includes('tall'));
 expect(low.castShadow).toBe(false);expect(tall.castShadow).toBe(true);
 expect(low.userData.cell).not.toBe(tall.userData.cell);
 field.cull(null,true);expect(low.parent.visible).toBe(false);expect(tall.parent.visible).toBe(true);
 field.cull(null);expect(low.parent.visible).toBe(true);
 const ray=new Raycaster(new Vector3(2.5,4,2.5),new Vector3(0,-1,0),0,8);
 expect(field.pick(ray)).toBe('low');field.destroy();
});

it('rejects flat offscreen cells without inflating their height to their horizontal span',async()=>{
 const field=new PropField(new Scene(),new Map()),internal=field as any,prototype=new Group();
 vi.spyOn(internal.referenceGround,'ready','get').mockReturnValue(Promise.resolve());
 prototype.add(new Mesh(new BoxGeometry(1,.4,1),new MeshStandardMaterial()));
 internal.protos.set('plant#base',Promise.resolve(prototype));
 field.sync([{id:'left',asset:'plant',x:1,y:1},{id:'right',asset:'plant',x:45,y:45}]);await field.ready();
 const cell=[...internal.cells.values()][0] as any;
 expect(cell.box.max.y-cell.box.min.y).toBeLessThan(.403);
 // An elevated view intersects the old sphere-enclosing box but no geometry.
 const frustum=new Frustum(...Array.from({length:6},()=>new Plane(new Vector3(0,1,0),-5)));
 expect(frustum.intersectsSphere(internal.batches[0].boundingSphere)).toBe(true);
 field.cull(frustum);expect(cell.group.visible).toBe(false);
 // Preview immediately expands the existing cell, without waiting for commit.
 field.previewStamp({id:'left',asset:'plant',x:1,y:1,elevation:10});
 field.cull(frustum);expect(cell.group.visible).toBe(true);
 expect(field.pick(new Raycaster(new Vector3(1.5,12,1.5),new Vector3(0,-1,0),0,5))).toBe('left');
 field.destroy();
});

it('retains conservative bounds for terrain-conforming shader underlays',async()=>{
 const field=new PropField(new Scene(),new Map()),internal=field as any,prototype=new Group();
 vi.spyOn(internal.referenceGround,'ready','get').mockReturnValue(Promise.resolve());
 const material=new MeshStandardMaterial();material.userData.underlay=true;
 prototype.add(new Mesh(new BoxGeometry(20,.01,20),material));
 internal.protos.set('underlay#base',Promise.resolve(prototype));
 field.sync([{id:'patch',asset:'underlay',x:1,y:1}]);await field.ready();
 const batch=internal.batches[0],cell=internal.cells.get(batch.userData.cell);
 expect(cell.box.containsBox(batch.boundingSphere.getBoundingBox(new Box3()))).toBe(true);
 field.previewStamp({id:'patch',asset:'underlay',x:100,y:100,scale:2});
 expect(cell.box.containsBox(batch.boundingSphere.getBoundingBox(new Box3()))).toBe(true);
 field.destroy();
});

it('applies successive immutable harvests without visiting unchanged placements and safely falls back after skipped updates',async()=>{
 const {SceneryComposition}=await import('../../src/presentation/sceneryChanges');
 const {PlacedGrass}=await import('../../src/render/foliage/placedGrass');
 const scene=new Scene(),field=new PropField(scene,new Map()),internal=field as any,grass=new PlacedGrass(scene),height=new HeightField(256);
 vi.spyOn(internal.referenceGround,'ready','get').mockReturnValue(Promise.resolve());
 const prototype=new Group();prototype.add(new Mesh(new BoxGeometry(),new MeshStandardMaterial()));
 internal.protos.set('pine#base',Promise.resolve(prototype));
 const compose=new SceneryComposition(),base=Array.from({length:300},(_,i)=>({id:'base'+i,asset:'pine',x:50+i%30,y:50+Math.floor(i/30)}));
 const a={id:'a',asset:'pine',x:1,y:1},b={...a,id:'b',x:3},c={...a,id:'c',x:5};
 const sync=async(dynamic:typeof base)=>{field.sync(grass.sync(compose.compose(base,dynamic),height));await field.ready();};
 await sync([a,b,c]);
 const unchanged=internal.placed.get('base0'),farBatch=internal.batches.find((batch:any)=>batch.userData.stampIds.includes('base0')),version=farBatch.instanceMatrix.version;
 const visit=vi.spyOn(internal,'syncPlacement');
 await sync([b,c]);await sync([c]);
 expect(visit).not.toHaveBeenCalled();expect(internal.placed.size).toBe(base.length+1);
 expect(internal.placed.get('base0')).toBe(unchanged);expect(farBatch.instanceMatrix.version).toBe(version);
 expect(internal.placed.has('a')).toBe(false);expect(internal.placed.has('b')).toBe(false);
 const discovered={...a,id:'discovered',x:8};await sync([c,discovered]);
 expect(visit).not.toHaveBeenCalled();expect(internal.placed.get('discovered').position.x).toBe(8.5);
 await sync([c,{...discovered,x:12}]);
 expect(visit).not.toHaveBeenCalled();expect(internal.placed.get('discovered').position.x).toBe(12.5);
 // Skipping an intermediate publication must not apply its delta to older data.
 compose.compose(base,[a,c]);await sync([a]);
 expect(visit).toHaveBeenCalled();expect(internal.placed.has('c')).toBe(false);expect(internal.placed.has('a')).toBe(true);
 // A later edit still updates the surviving transform through the full path.
 await sync([{...a,x:140}]);expect(internal.placed.get('a').position.x).toBe(140.5);
 field.destroy();grass.destroy();
});

it('does not apply removal hints to a partially loaded forest',async()=>{
 const {SceneryComposition}=await import('../../src/presentation/sceneryChanges');
 const compose=new SceneryComposition(),base:import('../../src/shared/map/utcmap').MapStamp[]=[],field=new PropField(new Scene(),new Map()),internal=field as any;
 vi.spyOn(internal.referenceGround,'ready','get').mockReturnValue(Promise.resolve());
 let resolve!:(root:Group)=>void;internal.protos.set('pine#base',new Promise<Group>(done=>{resolve=done;}));
 const a={id:'a',asset:'pine',x:1,y:1},b={...a,id:'b',x:3};
 field.sync(compose.compose(base,[a,b]));field.sync(compose.compose(base,[b]));
 const root=new Group();root.add(new Mesh(new BoxGeometry(),new MeshStandardMaterial()));resolve(root);await field.ready();
 expect([...internal.placed.keys()]).toEqual(['b']);field.destroy();
});
