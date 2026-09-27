import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {content} from '../../src/content/builtin';

const id='asset.models.resources.amber-deposit';
const bytes=readFileSync(`assets/library/${id}/geometry.glb`);
const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
const manifest=JSON.parse(readFileSync(`art/assets/${id}/asset.json`,'utf8'));
it('publishes the measured neutral deposit within its gameplay footprint and budget',()=>{
 expect(bytes.equals(readFileSync(`art/assets/${id}/geometry.glb`))).toBe(true);
 expect(gltf.nodes).toHaveLength(1);expect(gltf.meshes).toHaveLength(1);
 const p=gltf.meshes[0].primitives[0],position=gltf.accessors[p.attributes.POSITION];
 expect(gltf.meshes[0].primitives).toHaveLength(1);
 expect(gltf.accessors[p.indices].count/3).toBeLessThanOrEqual(10000);
 const def=content.get('building.neutral.amber-mine');
 expect(position.min[1]).toBeCloseTo(0,4);
 expect(position.max[0]-position.min[0]).toBeLessThan(def.footprint!.width);
 expect(position.max[2]-position.min[2]).toBeLessThan(def.footprint!.depth);
 expect(manifest.bindings.render.map((r:any)=>r.id)).toContain(def.asset);
 expect(content.asset(def.icon!).image).toBeDefined();
});
it('retains all surface maps and never applies ownership or opacity to amber',()=>{
 const m=gltf.materials[0];expect(gltf.materials).toHaveLength(1);
 expect(m.extras?.teamColorMask).toBeUndefined();expect(manifest.capabilities.teamColor).toBeUndefined();
 expect(m.alphaMode??'OPAQUE').toBe('OPAQUE');
 expect(m.pbrMetallicRoughness.baseColorTexture).toBeDefined();
 expect(m.pbrMetallicRoughness.metallicRoughnessTexture).toBeDefined();expect(m.normalTexture).toBeDefined();
});
