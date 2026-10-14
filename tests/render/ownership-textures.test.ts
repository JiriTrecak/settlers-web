import {afterEach,expect,it,vi} from 'vitest';
import {encode} from 'fast-png';
import {GLTFLoader,type GLTFParser} from 'three/addons/loaders/GLTFLoader.js';
import {ClampToEdgeWrapping,DataTexture,NearestFilter,RepeatWrapping,SRGBColorSpace,type MeshStandardMaterial} from 'three';
import {ownershipTexturePlugin} from '../../src/render/loading/ownershipTextures';

afterEach(()=>vi.unstubAllGlobals());
it('preserves authored RGB under zero ownership alpha without browser image decoding, and retains glTF sampler and colour space',async()=>{
 vi.stubGlobal('self',globalThis);
 vi.stubGlobal('ProgressEvent',class {constructor(public type:string){}});
 const pixels=new Uint8Array([123,80,40,0,128,128,128,255]);
 const png=encode({width:2,height:1,data:pixels,channels:4,depth:8});
 const json={asset:{version:'2.0'},scenes:[{nodes:[]}],scene:0,
  buffers:[{byteLength:png.byteLength,uri:'data:application/octet-stream;base64,'+Buffer.from(png).toString('base64')}],
  bufferViews:[{buffer:0,byteOffset:0,byteLength:png.byteLength}],images:[{bufferView:0,mimeType:'image/png'}],
  samplers:[{magFilter:9728,minFilter:9728,wrapS:33071,wrapT:10497}],textures:[{source:0,sampler:0}],
  materials:[{extras:{teamColorMask:'baseColorAlpha'},pbrMetallicRoughness:{baseColorTexture:{index:0}}}]};
 let material:MeshStandardMaterial|undefined;
 const loader=new GLTFLoader().register(ownershipTexturePlugin).register(parser=>({name:'test_capture',afterRoot:async()=>{material=await parser.getDependency('material',0);}}));
 await loader.parseAsync(JSON.stringify(json),'');
 const texture=material!.map! as DataTexture;
 expect(texture).toBeInstanceOf(DataTexture);
 expect([...texture.image.data!]).toEqual([...pixels]);
 expect(texture.flipY).toBe(false);expect(texture.premultiplyAlpha).toBe(false);
 expect(texture.colorSpace).toBe(SRGBColorSpace);
 expect(texture.magFilter).toBe(NearestFilter);expect(texture.minFilter).toBe(NearestFilter);
 expect(texture.wrapS).toBe(ClampToEdgeWrapping);expect(texture.wrapT).toBe(RepeatWrapping);
 expect(texture.generateMipmaps).toBe(false);texture.dispose();material!.dispose();
});
it('leaves ordinary transparency and unmarked material images to the standard loader',()=>{
 const parser={json:{materials:[{pbrMetallicRoughness:{baseColorTexture:{index:0}}}]},options:{manager:undefined}} as unknown as GLTFParser;
 expect(ownershipTexturePlugin(parser).loadTexture!(0)).toBeNull();
});
