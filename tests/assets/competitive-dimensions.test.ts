import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {Box3,Matrix4,Quaternion,Vector3} from 'three';
import {content} from '../../src/content/builtin';
import {resourceDepositAssets} from '../../src/render/settlement/resourceDepositVisual';
import {previewModelScale} from '../../tooling/src/asset-editor/modelScale';
import {assetDefinitionSchema} from '../../src/shared/authoring/asset';

// Content validation over every shipped building: check the actual published meshes at their
// game scale, including every depletion stage. An unchanged collider must not hide a much larger
// render footprint, the entrance must lie outside the footprint, and the asset editor must preview
// the model at the same scale the game renders it.
function sceneBounds(file:string){
 const bytes=readFileSync(file),gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString()),bounds=new Box3();
 const visit=(index:number,parent:Matrix4)=>{
  const node=gltf.nodes[index],local=node.matrix?new Matrix4().fromArray(node.matrix):new Matrix4().compose(
   new Vector3().fromArray(node.translation??[0,0,0]),new Quaternion().fromArray(node.rotation??[0,0,0,1]),new Vector3().fromArray(node.scale??[1,1,1]));
  const world=parent.clone().multiply(local);
  if(node.mesh!==undefined)for(const p of gltf.meshes[node.mesh].primitives){
   const a=gltf.accessors[p.attributes.POSITION];
   bounds.union(new Box3(new Vector3().fromArray(a.min),new Vector3().fromArray(a.max)).applyMatrix4(world));
  }
  for(const child of node.children??[])visit(child,world);
 };
 for(const root of gltf.scenes[gltf.scene??0].nodes)visit(root,new Matrix4());
 return bounds;
}
const published=()=>(JSON.parse(readFileSync('assets/authoring/published.json','utf8')) as {assets:unknown[]}).assets.map(a=>assetDefinitionSchema.parse(a));

for(const definition of content.definitions.filter(d=>d.kind==='building'&&d.footprint)){
 it(`${definition.id} fits its declared construction footprint in every visual state`,()=>{
  const authored=published();
  for(const id of resourceDepositAssets(definition)){
   const asset=content.asset(id),scale=(asset.scale??1)*(definition.modelScale??1),bounds=sceneBounds(asset.file!);
   expect(bounds.min.y*scale,id).toBeGreaterThan(-1e-3);
   for(const [axis,extent] of [['x',definition.footprint!.width],['z',definition.footprint!.depth]] as const){
    expect(bounds.min[axis]*scale,id).toBeGreaterThanOrEqual(-extent/2-1e-6);
    expect(bounds.max[axis]*scale,id).toBeLessThanOrEqual(extent/2+1e-6);
   }
   const author=authored.find(a=>a.bindings.render.some(b=>b.id===id));
   if(author)expect(previewModelScale(author),id).toBeCloseTo(scale);
  }
  if(definition.entrance)expect(Math.abs(definition.entrance.y)).toBeGreaterThan(Math.floor(definition.footprint!.depth/2));
 });
}
