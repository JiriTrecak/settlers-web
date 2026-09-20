import {afterEach,describe,expect,it,vi} from 'vitest';
import {Box3,BoxGeometry,Group,Mesh,MeshStandardMaterial,OrthographicCamera,Scene,Vector3} from 'three';
import {GLTFLoader,type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {PropField,type PropModelOptions} from '../../src/render/prop/propField';
import {transformedModel} from '../../src/render/prop/modelTransform';
import {Camera} from '../../src/render/camera/camera';
import {frameModel} from '../../tooling/src/asset-editor/framing';

const transform={scale:2,pivot:[1,2,3] as [number,number,number],up:'Y' as const,forward:'-Z' as const};
const model=(scale=1):PropModelOptions=>({sourceAsset:'tree-test',transform:{...transform,scale,pivot:[0,0,0],forward:'+Z'},groundContact:'pivot'});
const loaded:Group[]=[];
function gltf(){const scene=new Group();const mesh=new Mesh(new BoxGeometry(2,4,2),new MeshStandardMaterial());mesh.position.y=2;scene.add(mesh);loaded.push(scene);return {scene,animations:[]} as unknown as GLTF;}
afterEach(()=>{vi.restoreAllMocks();loaded.length=0;});
describe('authored model rendering',()=>{
 it('places a source-coordinate pivot at the instance anchor without animation overwriting it',()=>{
  const source=new Group(),root=transformedModel(source,transform);root.position.set(10,7,20);root.scale.setScalar(3);root.updateMatrixWorld(true);
  expect(source.localToWorld(new Vector3(1,2,3)).distanceTo(root.position)).toBeLessThan(1e-8);
  expect(source.localToWorld(new Vector3(1,2,4)).distanceTo(new Vector3(10,7,14))).toBeLessThan(1e-8);
  source.position.x=2;root.updateMatrixWorld(true);
  expect(root.position.toArray()).toEqual([10,7,20]);expect(root.scale.x).toBe(3);
 });
 it('isolates a draft alias, refreshes changed transforms and disposes replaced geometry',async()=>{
  const load=vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async()=>gltf());
  const field=new PropField(new Scene(),new Map([['tree-test','published']]));
  const urls=new Map([['tree-test','published'],['preview','draft']]);
  field.setUrls(urls,new Map([['preview',model(2)]]));
  const stamps=[{id:'map-tree',asset:'tree-test',x:10,y:10},{id:'draft-tree',asset:'preview',x:20,y:10,scale:3}];
  field.sync(stamps);await field.ready();await Promise.resolve();
  expect(field.boundsFor(['map-tree']).getSize(new Vector3()).y).toBe(4);
  expect(field.boundsFor(['draft-tree']).getSize(new Vector3()).y).toBe(24);
  const old=loaded[1]!.children[0] as Mesh,dispose=vi.spyOn(old.geometry,'dispose');
  field.setUrls(urls,new Map([['preview',model(.5)]]));field.sync(stamps);await field.ready();await Promise.resolve();
  expect(dispose).toHaveBeenCalledOnce();expect(load).toHaveBeenCalledTimes(3);
  expect(field.boundsFor(['map-tree']).getSize(new Vector3()).y).toBe(4);
  expect(field.boundsFor(['draft-tree']).getSize(new Vector3()).y).toBe(6);
  field.setUrls(new Map(urls),new Map([['preview',model(.5)]]));field.sync(stamps);await field.ready();
  expect(load).toHaveBeenCalledTimes(3);field.destroy();
 });
 it('reloads replaced files even when the stamp array and asset ID are unchanged',async()=>{
  const load=vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async()=>gltf());
  const field=new PropField(new Scene(),new Map([['tree-test','v1']])),stamps=[{id:'tree',asset:'tree-test',x:0,y:0}];
  field.sync(stamps);await field.ready();field.setUrls(new Map([['tree-test','v2']]));field.sync(stamps);await field.ready();
  expect(load.mock.calls.map(c=>c[0])).toEqual(['v1','v2']);expect(field.diagnostics().loaded).toBe(1);field.destroy();
 });
 it('does not resurrect a stale draft whose load finishes after replacement',async()=>{
  let complete!:(value:GLTF)=>void;
  vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(url=>url==='v1'?new Promise(resolve=>{complete=resolve;}):Promise.resolve(gltf()));
  const field=new PropField(new Scene(),new Map([['tree-test','v1']])),stamps=[{id:'tree',asset:'tree-test',x:0,y:0}];
  field.sync(stamps);field.setUrls(new Map([['tree-test','v2']]));field.sync(stamps);await field.ready();
  const old=gltf(),dispose=vi.spyOn((old.scene.children[0] as Mesh).geometry,'dispose');complete(old);await Promise.resolve();await Promise.resolve();await Promise.resolve();
  expect(field.diagnostics().loaded).toBe(1);expect(dispose).toHaveBeenCalledOnce();field.destroy();
 });
 it.each([.45,1,2.4])('frames tall elevated models in a viewport with aspect %s',aspect=>{
  const bounds=new Box3(new Vector3(10,20,30),new Vector3(14,90,38)),camera=new Camera();camera.setGame(false);camera.maxZoom=10000;
  camera.pose({yaw:-Math.PI/4,pitch:Math.PI/4,...frameModel(bounds,aspect,-Math.PI/4,Math.PI/4)});
  const projection=new OrthographicCamera();camera.applyTo(projection,aspect*800,800);projection.updateMatrixWorld();
  for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
   const p=new Vector3(x,y,z).project(projection);expect(Math.abs(p.x)).toBeLessThan(.81);expect(Math.abs(p.y)).toBeLessThan(.81);expect(Math.abs(p.z)).toBeLessThan(1);
  }
 });
});
