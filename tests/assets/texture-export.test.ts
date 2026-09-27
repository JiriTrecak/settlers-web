import {readFile} from 'node:fs/promises';
import {expect,it} from 'vitest';
import sharp from 'sharp';
import {resizeModelTextures} from '../../tooling/asset-studio/server/authoring/textureExport';
import {readGlb} from '../../tooling/asset-studio/server/authoring/modelQuality';
it('reduces real warrior textures without changing mesh, animation, rig or team material data',async()=>{
 const bytes=await readFile('art/assets/asset.models.units.ants-warrior/source_8.glb'),original=readGlb(bytes),result=readGlb(await resizeModelTextures(bytes,512));
 for(const key of ['meshes','nodes','skins','animations','accessors','materials'])expect(result.doc[key]).toEqual(original.doc[key]);
 const images=new Set(result.doc.images.map((i:any)=>i.bufferView));
 for(const [i,v] of result.doc.bufferViews.entries()){
  const out=result.bin.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength),old=original.doc.bufferViews[i];
  if(images.has(i)){const meta=await sharp(out).metadata();expect(Math.max(meta.width!,meta.height!)).toBeLessThanOrEqual(512);}
  else expect(out.equals(original.bin.subarray(old.byteOffset??0,(old.byteOffset??0)+old.byteLength))).toBe(true);
 }
 expect(result.doc.materials.some((m:any)=>m.name?.startsWith('TC_'))).toBe(true);
 expect((await resizeModelTextures(await resizeModelTextures(bytes,512),512)).equals(await resizeModelTextures(bytes,512))).toBe(true);
});
