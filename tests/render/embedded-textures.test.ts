import {expect,it,vi} from 'vitest';
import {Texture,SRGBColorSpace,NoColorSpace} from 'three';
import type {GLTFParser} from 'three/addons/loaders/GLTFLoader.js';
import {EmbeddedTexturePool} from '../../src/render/loading/embeddedTextures';

function parser(bytes:number[],options:{sampler?:object;name?:string;mimeType?:string;extensions?:object}={}){
 const texture=new Texture({width:1,height:1} as any);texture.flipY=false;texture.needsUpdate=true;
 const loadTexture=vi.fn(async()=>texture);
 const value={json:{textures:[{source:0,sampler:0,extensions:options.extensions}],images:[{bufferView:0,mimeType:options.mimeType??'image/png',name:options.name,extras:{label:options.name}}],samplers:[options.sampler??{}]},associations:new Map(),getDependency:vi.fn(async()=>new Uint8Array(bytes).buffer),loadTexture};
 return {value:value as unknown as GLTFParser,loadTexture,texture};
}

it('decodes identical concurrent GLB images once while keeping texture state and associations independent',async()=>{
 const pool=new EmbeddedTexturePool(),a=parser([1,2,3],{name:'Bark A'}),b=parser([1,2,3],{name:'Bark B'});
 const [first,second]=await Promise.all([pool.plugin(a.value).loadTexture!(0),pool.plugin(b.value).loadTexture!(0)]);
 expect(a.loadTexture.mock.calls.length+b.loadTexture.mock.calls.length).toBe(1);
 expect(first).not.toBe(second);expect(first!.source).toBe(second!.source);
 expect(first!.name).toBe('Bark A');expect(second!.name).toBe('Bark B');
 expect(first!.userData.label).toBe('Bark A');expect(second!.userData.label).toBe('Bark B');
 expect(a.value.associations.get(first!)).toEqual({textures:0});expect(b.value.associations.get(second!)).toEqual({textures:0});
 first!.colorSpace=SRGBColorSpace;first!.offset.set(.3,.7);first!.channel=1;first!.anisotropy=8;
 expect(second!.colorSpace).toBe(NoColorSpace);expect(second!.offset.toArray()).toEqual([0,0]);expect(second!.channel).toBe(0);expect(second!.anisotropy).toBe(1);
 const c=parser([1,2,3]),third=await pool.plugin(c.value).loadTexture!(0);
 expect(c.loadTexture).not.toHaveBeenCalled();expect(third!.source).toBe(first!.source);expect(third!.colorSpace).toBe(NoColorSpace);
 first!.dispose();expect(third!.image).toBe(second!.image);
 expect(pool.diagnostics()).toEqual({requests:3,shared:2,unique:1});
});

it('keeps different image bytes and sampler states distinct and defers extensions to native loaders',async()=>{
 const pool=new EmbeddedTexturePool();
 const sources=[parser([1]),parser([2]),parser([1],{sampler:{wrapS:33071}})];
 const textures=await Promise.all(sources.map(p=>pool.plugin(p.value).loadTexture!(0)));
 expect(new Set(textures.map(t=>t!.source)).size).toBe(3);
 for(const p of sources)expect(p.loadTexture).toHaveBeenCalledTimes(1);
 for(const options of [{mimeType:'image/ktx2'},{extensions:{KHR_texture_basisu:{source:0}}}]){
  const p=parser([1],options);expect(pool.plugin(p.value).loadTexture!(0)).toBeNull();expect(p.loadTexture).not.toHaveBeenCalled();
 }
 const external=parser([1]);external.value.json.images[0].uri='texture.png';
 expect(pool.plugin(external.value).loadTexture!(0)).toBeNull();
});

it('evicts failed image loads so a later model can retry and does not retain loads after disposal',async()=>{
 const pool=new EmbeddedTexturePool(),failed=parser([1]);failed.loadTexture.mockResolvedValueOnce(null as any);
 expect(await pool.plugin(failed.value).loadTexture!(0)).toBeNull();expect(pool.diagnostics().unique).toBe(0);
 const retry=parser([1]);expect(await pool.plugin(retry.value).loadTexture!(0)).toBeInstanceOf(Texture);expect(retry.loadTexture).toHaveBeenCalledTimes(1);
 const pending=parser([2]),loading=pool.plugin(pending.value).loadTexture!(0);pool.dispose();await loading;
 expect(pool.diagnostics().unique).toBe(0);expect(pool.plugin(parser([1]).value).loadTexture!(0)).toBeNull();
});
