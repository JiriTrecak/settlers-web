import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {content} from '../../src/content/builtin';
import {resourceDepositAssets} from '../../src/render/settlement/resourceDepositVisual';
import {previewModelScale} from '../../tooling/src/asset-editor/modelScale';
import {assetDefinitionSchema} from '../../src/shared/authoring/asset';
import published from '../../assets/authoring/published.json';

// Check actual shipped meshes at their game scale, including every depletion
// stage. An unchanged collider must not hide a much larger render footprint.
for(const definition of content.definitions.filter(d=>d.kind==='building'&&d.modelScale)){
 it(`${definition.id} fits its declared construction footprint in every visual state`,()=>{
  for(const id of resourceDepositAssets(definition.id,definition.asset)){
   const asset=content.asset(id),bytes=readFileSync(asset.file!);
   const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
   const scale=(asset.scale??1)*definition.modelScale!;
   const positions=gltf.meshes.flatMap((m:any)=>m.primitives.map((p:any)=>gltf.accessors[p.attributes.POSITION]));
   // These published buildings have one identity node; keep that assumption explicit.
   expect(gltf.nodes).toHaveLength(1);
   expect(gltf.nodes[0].scale??[1,1,1]).toEqual([1,1,1]);
   expect(gltf.nodes[0].translation??[0,0,0]).toEqual([0,0,0]);
   expect(gltf.nodes[0].rotation??[0,0,0,1]).toEqual([0,0,0,1]);
   expect(gltf.nodes[0].matrix).toBeUndefined();
   for(const [axis,extent] of [[0,definition.footprint!.width],[2,definition.footprint!.depth]]){
    const min=Math.min(...positions.map((p:any)=>p.min[axis]))*scale;
    const max=Math.max(...positions.map((p:any)=>p.max[axis]))*scale;
    expect(min).toBeGreaterThanOrEqual(-extent/2);
    expect(max).toBeLessThanOrEqual(extent/2);
   }
   const author=published.assets.find(a=>a.bindings.render.some(b=>b.id===id))!;
   expect(previewModelScale(assetDefinitionSchema.parse(author))).toBeCloseTo(scale);
  }
 });
}
