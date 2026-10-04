import {it,expect,vi} from 'vitest';
import {SpriteMaterial,Texture,TextureLoader,ShaderLib,type Material,type Sprite} from 'three';
import {configureFlipbook,flipbookFrame,type Flipbook} from '../../src/render/abilities/flipbook';
import {EffectPlayer} from '../../src/render/abilities/effectPlayer';
import {visualEffectSchema} from '../../src/content/effects/schema';
const atlas:Flipbook={columns:4,rows:4,firstFrame:3,frames:5,frameTicks:2,mode:'once',randomStart:false};
function compile(material:Material){const shader={vertexShader:ShaderLib.sprite.vertexShader,fragmentShader:ShaderLib.sprite.fragmentShader,uniforms:{}} as Parameters<Material['onBeforeCompile']>[0];material.onBeforeCompile(shader,undefined as never);return shader;}
it('samples atlas frame intervals, holds the last frame, loops and ping-pongs without an incremental clock',()=>{
 expect([-5,0,1,2,8,100].map(t=>flipbookFrame(atlas,t))).toEqual([3,3,3,4,7,7]);
 expect([0,8,10,12].map(t=>flipbookFrame({...atlas,mode:'loop'},t))).toEqual([3,7,3,4]);
 expect([0,2,4,6,8,10,12,14,16].map(t=>flipbookFrame({...atlas,mode:'ping-pong'},t))).toEqual([3,4,5,6,7,6,5,4,3]);
 expect(flipbookFrame({...atlas,frames:1,mode:'ping-pong'},500)).toBe(3);
 expect(flipbookFrame({...atlas,randomStart:true},0,.8)).toBe(7);
});
it('keeps frame UVs local to each material while sharing one image and composing shader hooks',async()=>{
 const texture=new Texture(),a=new SpriteMaterial({map:texture}),b=new SpriteMaterial({map:texture});
 const original=vi.fn();a.onBeforeCompile=original;configureFlipbook(a,atlas);configureFlipbook(b,{...atlas,firstFrame:4});
 const sa=compile(a),sb=compile(b);expect(original).toHaveBeenCalledTimes(1);expect(sa.vertexShader).toContain('vMapUv = vMapUv * uEffectAtlas.xy + uEffectAtlas.zw');
 expect(sa.uniforms.uEffectAtlas.value.toArray()).toEqual([.25,.25,.75,.75]);expect(sb.uniforms.uEffectAtlas.value.toArray()).toEqual([.25,.25,0,.5]);
 expect(a.map).toBe(b.map);expect(texture.offset.toArray()).toEqual([0,0]);a.dispose();b.dispose();texture.dispose();
});
const effect=()=>visualEffectSchema.parse({schemaVersion:1,id:'effect.test.atlas',name:'Atlas',durationTicks:40,layers:[{id:'sprite',shape:'particles',colour:'#ffffff',accent:'#ffffff',durationTicks:40,count:2,size:1,height:1,texture:{asset:'asset.effects.holy-light-spark',role:'image',index:1},flipbook:{...atlas,firstFrame:0,frames:16,frameTicks:1},emitter:{mode:'continuous',lifetimeTicks:20,rate:40,speed:1,speedVariation:0,direction:{x:0,y:1,z:0},coneDegrees:0,gravity:0,drag:0,spawnRadius:0,startSize:1,endSize:1,spin:0,fadeIn:0,fadeOut:0}}]});
it('samples continuous particles from their individual births and reproduces frames after rewind',()=>{
 const loader=vi.spyOn(TextureLoader.prototype,'load').mockReturnValue(new Texture()),player=new EffectPlayer();
 try{player.play(effect());player.update(2);const materials=player.root.children[0].children.map(p=>(p as Sprite).material),shaders=materials.map(compile);const rects=()=>shaders.map(s=>s.uniforms.uEffectAtlas.value.toArray());expect(rects()).toEqual([[.25,.25,0,.75],[.25,.25,.25,.75]]);const before=rects();player.update(17);player.update(2);expect(rects()).toEqual(before);}finally{player.dispose();loader.mockRestore();}
});
it('waits for textures before capture, reports active load failures, and ignores retired cues',async()=>{
 let loaded!:()=>void,failed!:()=>void;const loader=vi.spyOn(TextureLoader.prototype,'load').mockImplementation((_url,onLoad,_progress,onError)=>{const map=new Texture({width:512,height:512} as HTMLImageElement);loaded=()=>onLoad?.(map);failed=()=>onError?.(new Error('unavailable'));return map;});
 const player=new EffectPlayer(),bad=new EffectPlayer();try{
  player.play(effect());let ready=false;const waiting=player.ready().then(()=>ready=true);await Promise.resolve();expect(ready).toBe(false);loaded();await waiting;expect(ready).toBe(true);
  bad.play(effect());failed();await expect(bad.ready()).rejects.toThrow('Effect texture failed to load');bad.clear();await expect(bad.ready()).resolves.toBeUndefined();
 }finally{player.dispose();bad.dispose();loader.mockRestore();}
});
it('rejects atlases outside their grid and atlas settings on untextured layers',()=>{
 const invalid=effect();invalid.layers[0].flipbook!.frames=64;invalid.layers[0].flipbook!.firstFrame=1;expect(visualEffectSchema.safeParse(invalid).success).toBe(false);
 const missing=effect();delete missing.layers[0].texture;expect(visualEffectSchema.safeParse(missing).success).toBe(false);
});
