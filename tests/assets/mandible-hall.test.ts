import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {Box3,Matrix4,Vector3,Quaternion} from 'three';
import {assetDefinitionSchema} from '../../src/shared/authoring/asset';
const folder='art/assets/asset.models.buildings.ants-mandible-hall';
const bytes=readFileSync(folder+'/geometry.glb');
const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
describe('Mandible Hall runtime asset',()=>{
 it('stays within the 10k-triangle main-building budget',()=>{
  const triangles=gltf.meshes.flatMap((m:any)=>m.primitives).reduce((n:number,p:any)=>n+gltf.accessors[p.indices].count/3,0);
  expect(triangles).toBeGreaterThan(5000);expect(triangles).toBeLessThanOrEqual(10000);
 });
 it('exports recolorable ownership plates with neutral texture and independent natural materials',()=>{
  const definition=assetDefinitionSchema.parse(JSON.parse(readFileSync(folder+'/asset.json','utf8')));
  expect(definition.capabilities.teamColor).toEqual({mode:'material',slots:['TC_TeamColor']});
  const team=gltf.materials.findIndex((m:any)=>m.name==='TC_TeamColor');expect(team).toBeGreaterThanOrEqual(0);
  const material=gltf.materials[team];expect(material.pbrMetallicRoughness.baseColorFactor[0]).toBeGreaterThan(material.pbrMetallicRoughness.baseColorFactor[1]);
  const primitives=gltf.meshes.flatMap((m:any)=>m.primitives);
  expect(primitives.filter((p:any)=>p.material===team).length).toBeGreaterThan(0);
  for(const p of primitives.filter((p:any)=>p.material===team))expect(p.attributes.COLOR_0).toBeUndefined();
  expect(new Set(gltf.materials.map((m:any)=>m.name))).toEqual(new Set(['Wood_Dark','Wood_Light_Dome','Leaf_Green','Chitin_Red','Ivory','Interior_Dark','TC_TeamColor']));
  const bounds=new Box3();
  for(const node of gltf.nodes){
   const transform=new Matrix4().compose(new Vector3().fromArray(node.translation??[0,0,0]),new Quaternion().fromArray(node.rotation??[0,0,0,1]),new Vector3().fromArray(node.scale??[1,1,1]));
   for(const primitive of gltf.meshes[node.mesh].primitives){const a=gltf.accessors[primitive.attributes.POSITION];bounds.union(new Box3(new Vector3().fromArray(a.min),new Vector3().fromArray(a.max)).applyMatrix4(transform));}
  }
  expect(bounds.min.y).toBeGreaterThan(-.0001);expect(bounds.max.y).toBeLessThan(8.9);
 });
});
