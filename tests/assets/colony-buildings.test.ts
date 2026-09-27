import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {Box3,Matrix4,Quaternion,Vector3} from 'three';

const game=JSON.parse(readFileSync('content/game.json','utf8'));
const buildings=[
 ['ants-mound','building.ants.house'],
 ['ants-barracks','building.ants.barracks'],
 ['ants-rootworks','building.ants.rootworks'],
 ['ants-chitin-works','building.ants.ironroot-forge'],
 ['ants-bombardier-workshop','building.ants.bombardier-workshop'],
 ['ants-watchtower','building.ants.tower'],
] as const;

describe.each(buildings)('%s published building', (slug,definition)=>{
 const id=`asset.models.buildings.${slug}`;
 const source=readFileSync(`art/assets/${id}/geometry.glb`);
 const bytes=readFileSync(`assets/library/${id}/geometry.glb`);
 const length=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.subarray(20,20+length).toString());
 const manifest=JSON.parse(readFileSync(`art/assets/${id}/asset.json`,'utf8'));
 const def=game.definitions.find((d:any)=>d.id===definition);
 it('publishes the actual canonical model with the existing gameplay binding',()=>{
  expect(bytes.equals(source)).toBe(true);
  expect(manifest.bindings.render.some((r:any)=>r.id===def.asset)).toBe(true);
 });
 it('keeps complete scene geometry within the budget and gameplay footprint',()=>{
  let triangles=0;const bounds=new Box3();
  function visit(index:number,parent:Matrix4){
   const node=gltf.nodes[index],local=node.matrix?new Matrix4().fromArray(node.matrix):new Matrix4().compose(
    new Vector3().fromArray(node.translation??[0,0,0]),new Quaternion().fromArray(node.rotation??[0,0,0,1]),new Vector3().fromArray(node.scale??[1,1,1]));
   const world=parent.clone().multiply(local);
   if(node.mesh!==undefined)for(const p of gltf.meshes[node.mesh].primitives){
    expect(p.mode??4).toBe(4);
    const a=gltf.accessors[p.attributes.POSITION];
    triangles+=(p.indices===undefined?a.count:gltf.accessors[p.indices].count)/3;
    bounds.union(new Box3(new Vector3().fromArray(a.min),new Vector3().fromArray(a.max)).applyMatrix4(world));
    expect(p.attributes.TEXCOORD_0).toBeDefined();expect(p.attributes.NORMAL).toBeDefined();
   }
   for(const child of node.children??[])visit(child,world);
  }
  for(const root of gltf.scenes[gltf.scene??0].nodes)visit(root,new Matrix4());
  expect(triangles).toBeGreaterThan(100);expect(triangles).toBeLessThanOrEqual(10000);
  expect(bounds.min.y).toBeCloseTo(0,4);
  expect(Math.max(Math.abs(bounds.min.x),Math.abs(bounds.max.x))*2).toBeLessThanOrEqual(def.footprint.width);
  expect(Math.max(Math.abs(bounds.min.z),Math.abs(bounds.max.z))*2).toBeLessThanOrEqual(def.footprint.depth);
  expect(Math.abs(def.entrance.y)).toBeGreaterThan(Math.floor(def.footprint.depth/2));
 });
 it('retains per-pixel ownership and all three surface maps without transparency',()=>{
  expect(gltf.materials).toHaveLength(1);
  const m=gltf.materials[0];expect(m.extras.teamColorMask).toBe('baseColorAlpha');
  expect(m.alphaMode??'OPAQUE').toBe('OPAQUE');
  expect(m.pbrMetallicRoughness.baseColorTexture).toBeDefined();
  expect(m.pbrMetallicRoughness.metallicRoughnessTexture).toBeDefined();expect(m.normalTexture).toBeDefined();
  expect(manifest.capabilities.teamColor.mode).toBe('mask');
 });
});
