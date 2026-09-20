import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {Matrix4,Vector3} from 'three';
import {modelOcclusion,sampleVolume,spriteOcclusion,type OcclusionVolume} from '../../scripts/maps/scouring/occlusion';

it('samples normalized R8 volume centers with clamp-linear X/Z/Y addressing',()=>{
 // Two texels along each texture axis, each representing a distinct corner.
 const bytes=Uint8Array.from([0,20,40,60,80,100,120,140]);
 expect(sampleVolume(bytes,[2,2,2],[.25,.25,.25])).toBe(0);
 expect(sampleVolume(bytes,[2,2,2],[.75,.25,.25])).toBeCloseTo(20/255);
 expect(sampleVolume(bytes,[2,2,2],[.25,.75,.25])).toBeCloseTo(40/255);
 expect(sampleVolume(bytes,[2,2,2],[.25,.25,.75])).toBeCloseTo(80/255);
 expect(sampleVolume(bytes,[2,2,2],[.5,.5,.5])).toBeCloseTo(70/255);
 expect(sampleVolume(bytes,[2,2,2],[-2,3,3])).toBeCloseTo(120/255);
});
const volume:OcclusionVolume={boundsMin:[-5,-10,-5],boundsMax:[5,20,5],size:[1,1,1],axes:['x','z','y'],source:'fixture',sourceSha256:'',decodedSha256:'',decodedBytes:1};
it('projects the original model-volume bands and fades vertical borders',()=>{
 const inverse=new Matrix4(),solid=new Uint8Array([0]),empty=new Uint8Array([255]);
 expect(modelOcclusion(volume,empty,inverse,new Vector3())).toEqual([1,1,1]);
 for(const band of modelOcclusion(volume,solid,inverse,new Vector3()))expect(band).toBeCloseTo(.1);
 expect(modelOcclusion(volume,solid,inverse,new Vector3(0,30,0))).toEqual([1,1,1]);
 expect(modelOcclusion(volume,solid,inverse,new Vector3(0,-30,0))).toEqual([1,1,1]);
 // Nonuniform world translation must be undone before local-volume lookup.
 const translated=new Matrix4().makeTranslation(20,30,-10).invert();
 expect(modelOcclusion(volume,solid,translated,new Vector3(20,30,-10))).toEqual(modelOcclusion(volume,solid,inverse,new Vector3()));
 for(const band of modelOcclusion(volume,solid,inverse,new Vector3(),.5))expect(band).toBeCloseTo(.55);
});
it('retains source bridge voxels byte-for-byte with original bounds and axes',()=>{
 const prefix='assets/textures/reference/scouring/occlusion/wooden_bridge_small';
 const metadata=JSON.parse(readFileSync(prefix+'.json','utf8')),data=gunzipSync(readFileSync(prefix+'.bin'));
 expect(metadata.size).toEqual([103,198,15]);expect(metadata.axes).toEqual(['x','z','y']);
 expect(data.length).toBe(305910);expect(createHash('sha256').update(data).digest('hex')).toBe(metadata.decodedSha256);
 expect(metadata.boundsMin[1]).toBeCloseTo(-8.147597312927246);
 expect(metadata.boundsMax[1]).toBeCloseTo(7.292879104614258);
});

it('packs ambient bands without changing any original underlay-mask texel',async()=>{
 const {ReferenceGround}=await import('../../src/render/prop/referenceGround');
 const {sourceHeight,unpackSourceBytes}=await import('../../src/shared/map/importedTerrain');
 const map=JSON.parse(readFileSync('assets/maps/showcase/scouring-eldenvale.utcmap','utf8'));
 const source=map.landscape.importedTerrain,ground=new ReferenceGround();ground.updateSource(sourceHeight(source));
 const mask=unpackSourceBytes(source.underlayMask.mask),ao=unpackSourceBytes(source.occlusion.rgba),packed=ground.underlay.value.image.data!;
 expect(packed.length).toBe(mask.length*4);
 let mismatch=0;for(let i=0;i<mask.length;i++)if(packed[i*4]!==mask[i])mismatch++;
 expect(mismatch).toBe(0);
 // AO grid has one sample/unit; underlay has three. Exact shared lattice points
 // must preserve each band, including areas outside the model footprints.
 const [w,h]=source.occlusion.size,[pw]=source.underlayMask.size;
 for(let z=0;z<h;z+=11)for(let x=0;x<w;x+=7)for(let c=0;c<3;c++)expect(packed[((z*3)*pw+x*3)*4+c+1]).toBe(ao[(z*w+x)*4+c]);
 ground.dispose();
});


it('matches source sprite height bands and the packed base-height offset',()=>{
 const center=spriteOcclusion(1,.5,.5,12,.75);
 expect(center[0]).toBeCloseTo(.4);expect(center[1]).toBeCloseTo(.4);expect(center[2]).toBeCloseTo(.4);
 expect(center[3]).toBeCloseTo(3*.75*.5/8);
 // A short caster cannot darken the upper two bands or raise the base height.
 expect(spriteOcclusion(1,.5,.5,.5,.75)).toEqual([.3999999999999999,1,1,0]);
 expect(spriteOcclusion(0,0,0,12,.75)).toEqual([1,1,1,0]);
});

it('preserves terrain height while putting sprite height offsets in a spare channel',async()=>{
 const {ReferenceGround}=await import('../../src/render/prop/referenceGround');
 const {sourceHeight,unpackSourceBytes}=await import('../../src/shared/map/importedTerrain');
 const {HeightField}=await import('../../src/shared/map/height');
 const map=JSON.parse(readFileSync('assets/maps/showcase/scouring-eldenvale.utcmap','utf8'));
 const src=map.landscape.importedTerrain,height=sourceHeight(src),ground=new ReferenceGround();ground.updateSource(height);
 const ao=unpackSourceBytes(src.occlusion.rgba),data=ground.texture.value.image.data!;
 const [w,h]=src.occlusion.size,hw=src.heightSize[0];
 for(let z=0;z<h;z+=11)for(let x=0;x<w;x+=7){
  const texel=(z*3*hw+x*3)*4;
  expect(data[texel]).toBeCloseTo(height.at(x*3,z*3),5);
  expect(data[texel+1]).toBeCloseTo(ao[(z*w+x)*4+3]!/255,6);
 }
 // A native map must reallocate Red data instead of retaining RGBA stride.
 const native=new HeightField(64);native.samples.fill(3);ground.update(native);
 expect(ground.texture.value.image.data!.length).toBe(native.samples.length);
 expect(Array.from(ground.texture.value.image.data!).every(x=>x===3)).toBe(true);ground.dispose();
});
