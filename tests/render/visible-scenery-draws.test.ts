import {expect,it,vi} from 'vitest';
import {Box3,BoxGeometry,Color,Frustum,Group,InstancedMesh,Matrix4,Mesh,MeshStandardMaterial,Plane,Raycaster,Scene,Vector3} from 'three';
import {PropField} from '../../src/render/prop/propField';

function region(x:number,z:number,radius=8){
 return new Frustum(new Plane(new Vector3(1,0,0),radius-x),new Plane(new Vector3(-1,0,0),radius+x),new Plane(new Vector3(0,1,0),100),new Plane(new Vector3(0,-1,0),100),new Plane(new Vector3(0,0,1),radius-z),new Plane(new Vector3(0,0,-1),radius+z));
}
async function fixture(dew=false){
 const scene=new Scene(),field=new PropField(scene,new Map()),internal=field as any,prototype=new Group();
 vi.spyOn(internal.referenceGround,'ready','get').mockReturnValue(Promise.resolve());
 const mesh=new Mesh(new BoxGeometry(1,2,1),new MeshStandardMaterial());mesh.castShadow=true;mesh.userData.sourceTreeWind=true;prototype.add(mesh);
 if(dew)prototype.userData.dew=[0,2,0,.1];
 internal.protos.set('pine#base',Promise.resolve(prototype));
 const stamps=[{id:'a',asset:'pine',x:2,y:2},{id:'b',asset:'pine',x:102,y:102}];
 field.sync(stamps);await field.ready();
 return {scene,field,internal,stamps,main:scene.getObjectByName('Visible scenery') as Group,shadow:scene.getObjectByName('Scenery shadow draws') as Group};
}

it('combines visible cells while retaining separate main/shadow transforms and avoiding unchanged uploads',async()=>{
 const {scene,field,internal,main,shadow}=await fixture();
 expect(internal.batches).toHaveLength(2);expect(main.children).toHaveLength(1);
 const draw=main.children[0] as InstancedMesh,shadowDraw=shadow.children[0] as InstancedMesh,matrix=new Matrix4();
 field.cull(region(2,2));expect(draw.count).toBe(1);draw.getMatrixAt(0,matrix);expect(matrix.elements[12]).toBe(2.5);
 expect(main.visible).toBe(true);expect(internal.root.visible).toBe(false);
 const version=draw.instanceMatrix.version,colorVersion=draw.instanceColor!.version;
 field.cull(region(102,102),true);expect(shadowDraw.count).toBe(1);shadowDraw.getMatrixAt(0,matrix);expect(matrix.elements[12]).toBe(102.5);
 draw.getMatrixAt(0,matrix);expect(matrix.elements[12]).toBe(2.5);expect(draw.instanceMatrix.version).toBe(version);
 // Picking still uses spatial instance ids, independent of render visibility.
 expect(field.pick(new Raycaster(new Vector3(2.5,5,2.5),new Vector3(0,-1,0),0,10))).toBe('a');
 field.cull(null);expect(main.visible).toBe(false);expect(shadow.visible).toBe(false);expect(internal.root.visible).toBe(true);
 field.cull(region(2,2));expect(draw.instanceMatrix.version).toBe(version);expect(draw.instanceColor!.version).toBe(colorVersion);
 field.cull(region(52,52,60));expect(draw.count).toBe(2);expect(draw.instanceMatrix.version).toBeGreaterThan(version);
 field.destroy();expect(scene.children).toHaveLength(0);
});

it('tracks preview, commit, colour changes and removal while retaining unaffected draw buffers',async()=>{
 const {scene,field,internal,stamps,main}=await fixture(),draw=main.children[0] as InstancedMesh;
 const matrix=new Matrix4(),all=region(256,256,512);
 field.cull(all);const version=draw.instanceMatrix.version,revision=field.dewRevision;
 const moved={...stamps[0],x:200,y:200};field.previewStamp(moved);field.cull(all);
 expect(draw.instanceMatrix.version).toBeGreaterThan(version);expect(field.dewRevision).toBe(revision);
 const positions=()=>Array.from({length:draw.count},(_,i)=>{draw.getMatrixAt(i,matrix);return matrix.elements[12];}).sort((a,b)=>a-b);
 expect(positions()).toEqual([102.5,200.5]);
 field.sync([moved,stamps[1]]);await field.ready();field.cull(all);
 expect(main.children[0]).toBe(draw);expect(positions()).toEqual([102.5,200.5]);
 const source=internal.batches.find((b:InstancedMesh)=>b.userData.stampIds.includes('a')) as InstancedMesh;
 source.setColorAt(0,new Color(.25,1,1));source.instanceColor!.needsUpdate=true;internal.draws.invalidate();field.cull(all);
 const colors=Array.from({length:draw.count},(_,i)=>draw.instanceColor!.getX(i));expect(colors).toContain(.25);
 field.sync([moved]);await field.ready();field.cull(all);expect(main.children[0]).toBe(draw);expect(draw.count).toBe(1);expect(positions()).toEqual([200.5]);
 let disposed=0;draw.addEventListener('dispose',()=>disposed++);
 field.sync([]);await field.ready();expect(disposed).toBe(1);expect(main.children).toHaveLength(0);
 field.destroy();expect(scene.children).toHaveLength(0);
});

it('preserves independent blended draw sorting and distinct material states',async()=>{
 const scene=new Scene(),field=new PropField(scene,new Map()),internal=field as any;
 vi.spyOn(internal.referenceGround,'ready','get').mockReturnValue(Promise.resolve());
 const geometry=new BoxGeometry(1,2,1);
 for(const [id,transparent] of [['solid',false],['glass',true]] as const){const root=new Group();root.add(new Mesh(geometry,new MeshStandardMaterial({transparent,opacity:transparent?.5:1})));internal.protos.set(`${id}#base`,Promise.resolve(root));}
 field.sync([{id:'a',asset:'solid',x:2,y:2},{id:'b',asset:'solid',x:102,y:102},{id:'c',asset:'glass',x:2,y:2},{id:'d',asset:'glass',x:102,y:102}]);await field.ready();field.cull(region(52,52,60));
 const main=scene.getObjectByName('Visible scenery')!;
 expect(main.children).toHaveLength(3);
 const glass=main.children.filter(m=>(m as InstancedMesh).material instanceof MeshStandardMaterial&&((m as InstancedMesh).material as MeshStandardMaterial).transparent) as InstancedMesh[];
 expect(glass).toHaveLength(2);expect(glass.every(m=>m.count===1)).toBe(true);
 for(const mesh of glass)expect(mesh.boundingSphere!.getBoundingBox(new Box3()).isEmpty()).toBe(false);
 field.destroy();
});

it('reuses both unchanged camera lists after restore, invalidating on preview and rebuild',async()=>{
 const {field,internal,stamps,main,shadow}=await fixture();
 const front=region(2,2),back=region(102,102),sphere=vi.spyOn(front,'intersectsSphere'),box=vi.spyOn(front,'intersectsBox');
 field.cull(front);field.cull(back,true);
 const tested=sphere.mock.calls.length,cellTests=box.mock.calls.length;
 expect(tested).toBeGreaterThan(0);expect(cellTests).toBeGreaterThan(0);
 field.cull(null);field.cull(front);field.cull(back,true);field.cull(front);
 expect(sphere).toHaveBeenCalledTimes(tested);expect(box).toHaveBeenCalledTimes(cellTests);
 expect(main.visible).toBe(true);expect(shadow.visible).toBe(false);expect(internal.root.visible).toBe(false);
 field.previewStamp({...stamps[1],x:3,y:3});field.cull(front);
 expect(sphere.mock.calls.length).toBeGreaterThan(tested);expect((main.children[0] as InstancedMesh).count).toBe(2);
 field.cull(back,true);expect(shadow.children.every(m=>!m.visible)).toBe(true);
 field.sync([stamps[0]]);await field.ready();field.cull(front);expect((main.children[0] as InstancedMesh).count).toBe(1);
 field.destroy();
});

it('publishes exact dew snapshots after commit, undo, elevation and removal',async()=>{
 const {field,internal,stamps}=await fixture(true);
 const check=()=>{
  const roots=Array.from(internal.placed.values()) as Group[];
  expect(field.dew).toEqual(Float32Array.from(roots.flatMap(r=>Array.from(r.userData.dewWorld??[]) as number[])));
 };
 check();const dew=field.dew,beads=dew.slice();
 const moved={...stamps[0],x:150,yaw:1,scale:2};
 field.previewStamp(moved);expect(field.dew).toBe(dew);
 field.sync([moved,stamps[1]]);await field.ready();check();
expect(dew).toEqual(beads);
 field.sync(stamps);await field.ready();check();expect(field.dew).toEqual(beads);
 field.sync([{...stamps[0],elevation:5},stamps[1]]);await field.ready();check();
 field.sync([stamps[1]]);await field.ready();check();
 field.sync(stamps);await field.ready();check();
 field.sync([]);await field.ready();check();expect(field.dew).toHaveLength(0);
 field.destroy();
});

it('keeps resolved roots through stable edits and restores an uncommitted preview from unchanged records',async()=>{
 const {field,internal,stamps}=await fixture();
 const root=internal.placed.get('a'),other=internal.placed.get('b');
 const revision=field.dewRevision;
 field.previewStamp({...stamps[0],x:150});expect(root.position.x).toBe(150.5);
 // Publishing another scene may restore the original stamp object, not a clone.
 field.sync([...stamps]);await field.ready();
 expect(root.position.x).toBe(2.5);
 expect(internal.placed.get('a')).toBe(root);expect(internal.placed.get('b')).toBe(other);
 expect(field.dewRevision).toBe(revision);
 const restored=field.dewRevision;
 field.sync(stamps.map(s=>({...s})));await field.ready();expect(field.dewRevision).toBe(restored);
 // A late mismatch must invalidate the whole fast path before any root is edited.
 field.sync([{...stamps[0],x:20},{...stamps[1],id:'new'}]);await field.ready();
 expect(internal.placed.has('b')).toBe(false);expect(internal.placed.has('new')).toBe(true);
 expect(root.position.x).toBe(20.5);field.destroy();
});

it('does not reuse a resolved list across delayed asset replacements or obsolete spawn batches',async()=>{
 const {field,internal,stamps}=await fixture();
 let resolve!:(root:Group)=>void;
 internal.protos.set('replacement#base',new Promise<Group>(r=>resolve=r));
 field.sync([{...stamps[0],asset:'replacement'},stamps[1]]);
 field.sync([{...stamps[0],x:10},stamps[1]]);
 const replacement=new Group();replacement.add(new Mesh(new BoxGeometry(3,3,3),new MeshStandardMaterial()));resolve(replacement);
 await field.ready();
 expect(internal.placed.get('a').userData.asset).toBe('pine');expect(internal.placed.get('a').position.x).toBe(10.5);
 field.sync([{...stamps[0],asset:'replacement'},stamps[1]]);await field.ready();
 expect(internal.placed.get('a').userData.asset).toBe('replacement');
 field.sync(stamps);await field.ready();expect(internal.placed.get('a').userData.asset).toBe('pine');field.destroy();
});

it('reuses draw signatures but detects every changed render-state component',async()=>{
 const {VisibleSceneryDraws}=await import('../../src/render/prop/visibleDraws');
 const scene=new Scene(),root=new Group(),draws=new VisibleSceneryDraws(scene,root),geometry=new BoxGeometry(),otherGeometry=new BoxGeometry(2,2,2),material=new MeshStandardMaterial(),otherMaterial=new MeshStandardMaterial();
 scene.add(root);
 const a:InstancedMesh=new InstancedMesh(geometry,material,10),b:InstancedMesh=new InstancedMesh(geometry,material,10),sources=[a,b];
 draws.sync(sources);expect(draws.count).toBe(1);
 const stringify=vi.spyOn(JSON,'stringify');
 a.count=9;a.instanceMatrix.needsUpdate=true;draws.sync(sources);
 expect(stringify).not.toHaveBeenCalled();stringify.mockRestore();
 const different=(edit:()=>void,undo:()=>void)=>{edit();draws.sync(sources);expect(draws.count).toBe(2);undo();draws.sync(sources);expect(draws.count).toBe(1);};
 different(()=>{a.geometry=otherGeometry;},()=>{a.geometry=geometry;});
 different(()=>{a.material=otherMaterial;},()=>{a.material=material;});
 different(()=>{a.castShadow=true;},()=>{a.castShadow=false;});
 different(()=>{a.receiveShadow=true;},()=>{a.receiveShadow=false;});
 different(()=>{a.renderOrder=4;},()=>{a.renderOrder=0;});
 different(()=>{a.layers.mask=3;},()=>{a.layers.mask=1;});
 different(()=>{a.setColorAt(0,new Color('red'));},()=>{a.instanceColor=null;});
 different(()=>{a.customDepthMaterial=otherMaterial;},()=>{a.customDepthMaterial=undefined;});
 different(()=>{a.customDistanceMaterial=otherMaterial;},()=>{a.customDistanceMaterial=undefined;});
 different(()=>{a.userData.category='Tree triangles';},()=>{delete a.userData.category;});
 // Mutating a shared material in place must split transparent draws by object.
 different(()=>{material.transparent=true;},()=>{material.transparent=false;});
 const array=[material];a.material=array;draws.sync(sources);expect(draws.count).toBe(1);
 different(()=>{array[0]=otherMaterial;},()=>{array[0]=material;});
 different(()=>{array.push(material);},()=>{array.pop();});
 draws.dispose();a.dispose();b.dispose();geometry.dispose();otherGeometry.dispose();material.dispose();otherMaterial.dispose();
});
