import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {it,expect} from 'vitest';
import {Box3,Mesh,Texture,Vector2,Vector3,Group,MeshStandardMaterial,BoxGeometry,ShaderLib,type MeshDepthMaterial} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {referenceMaterialPlugin} from '../../src/render/prop/referenceMaterial';
import {TreePlayer} from '../../src/render/prop/treePlayer';
import {FoliageWindLayer} from '../../src/render/prop/foliageWind';
import {ReferenceGround} from '../../src/render/prop/referenceGround';
import {HeightField} from '../../src/shared/map/height';
import {prepareReferencePlants} from '../../src/render/prop/referencePlants';

it('retains source BRDF coefficients, linear channels and DDS row orientation',()=>{
 const prefix='assets/textures/reference/scouring/brdf-lut';
 const bytes=gunzipSync(readFileSync(prefix+'.bin'));
 const metadata=JSON.parse(readFileSync(prefix+'.json','utf8'));
 expect(bytes.length).toBe(64*64*4);expect(metadata.colorSpace).toBe('linear');
 expect(createHash('sha256').update(bytes).digest('hex')).toBe(metadata.decodedSha256);
 // Independent samples read directly from original DDS BGRA offsets. Inverting
 // rows or applying sRGB conversion breaks the runtime (NoV, 1-roughness) lookup.
 for(const [x,y,rgba] of [[0,0,[123,14,0,255]],[63,0,[33,1,0,255]],[0,63,[0,252,0,255]],[63,63,[255,5,0,255]],[32,32,[170,21,0,255]]] as const){
  const offset=(y*64+x)*4;expect(Array.from(bytes.subarray(offset,offset+4))).toEqual(rgba);
 }
});

async function load(folder:string,id:string){
 const bytes=readFileSync(`assets/models/environment/${folder}/reference-${id}/model.glb`);
 const loader=new GLTFLoader().register(referenceMaterialPlugin).register(()=>({name:'geometry-only-test-textures',loadTexture:()=>Promise.resolve(new Texture())}));
 return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
}
for(const [id,triangles,parts] of [['fir-a',694,3],['fir-b',1130,4],['fir-small-a',152,2],['stump-fir-a',689,3]] as const){
 it(`imports every ${id} material range with valid UVs, indices and correctly decoded normals`,async()=>{
  const {scene}=await load('trees',id);let count=0,meshes=0,normalCount=0,correct=0;
  scene.traverse(o=>{
   if(!(o instanceof Mesh))return;meshes++;
   const g=o.geometry,p=g.getAttribute('position'),n=g.getAttribute('normal'),uv=g.getAttribute('uv'),leaf=g.getAttribute('_leaf'),ix=g.index!;
   count+=ix.count/3;expect(uv.count).toBe(p.count);expect(leaf.count).toBe(p.count);
   for(const a of [p,n,uv,leaf])expect(Array.from(a.array).every(Number.isFinite)).toBe(true);
   const a=new Vector3(),b=new Vector3(),c=new Vector3(),normal=new Vector3();
   for(let i=0;i<ix.count;i+=3){
    const first=ix.getX(i);a.fromBufferAttribute(p,first);b.fromBufferAttribute(p,ix.getX(i+1)).sub(a);c.fromBufferAttribute(p,ix.getX(i+2)).sub(a);
    normal.fromBufferAttribute(n,first);const dot=b.cross(c).dot(normal);if(Math.abs(dot)>.00001){normalCount++;if(dot>0)correct++;}
   }
   const m=o.material as MeshStandardMaterial;
   expect(m.map).toBeTruthy();expect(m.userData.referenceEnvironment).toBe(true);
  });
  expect(meshes).toBe(parts);expect(count).toBe(triangles);expect(correct/normalCount).toBeGreaterThan(.95);
 });
}
for(const id of ['fir-a','fir-b','fir-small-a'])it(`${id} supports hit, fall and decay without changing mesh scale`,async()=>{
 const gltf=await load('trees',id),player=new TreePlayer(gltf.scene,gltf.animations);
 const f={hp:0,lastHitTick:0,fallTick:0,direction:{x:0,y:1}};
 player.sample(f,0,72,240);const initial=new Box3().setFromObject(gltf.scene,true);
 player.sample(f,72,72,240);const fallen=new Box3().setFromObject(gltf.scene,true);
 expect(fallen.max.y-fallen.min.y).toBeLessThan(initial.max.y-initial.min.y);
 expect(fallen.min.y).toBeGreaterThan(-.2);
 player.sample(f,311,72,240);
 // Underlay remains on the ground until the resource is gone; the crown sinks.
 const crown=gltf.scene.getObjectByName('reference-crown')!;
 expect(new Box3().setFromObject(crown,true).max.y).toBeLessThan(0);
 gltf.scene.traverse(o=>expect(o.scale.distanceTo(new Vector3(1,1,1))).toBeLessThan(.001));
 expect(player.sample(f,312,72,240)).toBe(false);player.dispose();
});
it('keeps fine grass silhouettes within ten triangles rather than geometric blades',async()=>{
 for(const id of ['grass-messy','grass-low']){
  const {scene}=await load('grass',id);let count=0;
  scene.traverse(o=>{if(o instanceof Mesh){count+=o.geometry.index!.count/3;expect((o.material as MeshStandardMaterial).alphaTest).toBeGreaterThan(0);expect(o.geometry.getAttribute('uv')).toBeTruthy();}});
  expect(count).toBe(10);
 }
});
it('preserves cutout alpha and leaf deformation in shadow passes while excluding underlays',()=>{
 const root=new Group(),map=new Texture(),m=new MeshStandardMaterial({map,alphaTest:.5});m.userData.foliage=true;
 const mesh=new Mesh(new BoxGeometry(),m),under=new Mesh(new BoxGeometry(),new MeshStandardMaterial());under.userData.underlay=true;root.add(mesh,under);
 const wind=new FoliageWindLayer();wind.attach(root,{amplitude:.12,speed:.22},12);
 expect((mesh.customDepthMaterial as MeshDepthMaterial).map).toBe(map);expect(mesh.customDepthMaterial!.alphaTest).toBe(.5);expect(under.customDepthMaterial).toBeUndefined();
 const shader=()=>({uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:''});
 const color=shader(),depth=shader();m.onBeforeCompile(color as never,{} as never);mesh.customDepthMaterial!.onBeforeCompile(depth as never,{} as never);
 expect(depth.vertexShader).toBe(color.vertexShader);expect(color.vertexShader).toContain('leafOffset=(_leaf.rgb*2.-1.)*4.');wind.dispose();
});
it('updates a shared underlay height texture on terrain edits and map resize',()=>{
 const ground=new ReferenceGround(),field=new HeightField(64);field.samples.fill(2);ground.update(field);
 const first=ground.texture.value;expect(first.image.width).toBe(field.verts);expect(first.image.data![0]).toBe(2);
 field.samples[0]=3;ground.update(field);expect(ground.texture.value).toBe(first);expect(first.image.data![0]).toBe(3);
 const resized=new HeightField(128);ground.update(resized);expect(ground.texture.value).not.toBe(first);expect(ground.grid.value.y).toBe(resized.verts);ground.dispose();
});
it('keeps source shelter out of vertex tint and shares the source sway with cutout shadows',()=>{
 const root=new Group(),m=new MeshStandardMaterial();m.userData.foliage=true;
 const mesh=new Mesh(new BoxGeometry(),m);root.add(mesh);
 const offset={value:new Vector2(256,256)},wind=new FoliageWindLayer();wind.attach(root,{amplitude:.12,speed:.22},12,offset);
 const shader=()=>({uniforms:{} as Record<string,unknown>,vertexShader:'#include <common>\n#include <color_vertex>\n#include <begin_vertex>',fragmentShader:''});
 const color=shader(),depth=shader();m.onBeforeCompile(color as never,{} as never);mesh.customDepthMaterial!.onBeforeCompile(depth as never,{} as never);
 expect(mesh.userData.sourceTreeWind).toBe(true);expect(depth.vertexShader).toBe(color.vertexShader);
 expect(color.uniforms.uSourceWindOffset).toBe(offset);
 expect(color.vertexShader).toContain('shelter=instanceColor.r;');
 expect(color.vertexShader).not.toContain('vColor.rgb *= instanceColor.rgb;');
 expect(color.vertexShader).toContain('vColor.rgb *= color;');
 expect(color.vertexShader).not.toContain('transformed.x+=sin(foliagePhase)');
 wind.dispose();mesh.geometry.dispose();m.dispose();
});

it('loads the bridge source shading texture as shared metalness and roughness data, not AO',async()=>{
 const {scene}=await load('props','wooden-bridge-small');let shaded=0;
 const ground=new ReferenceGround(),macro=new Texture();prepareReferencePlants(scene,ground,()=>macro);
 scene.traverse(node=>{
  if(!(node instanceof Mesh))return;
  for(const material of Array.isArray(node.material)?node.material:[node.material]){
   const m=material as MeshStandardMaterial;
   if(m.userData.shadingTexture===undefined)continue;
   shaded++;expect(m.userData.sourceShadingLoaded).toBe(true);
   expect(m.userData.sourceShader).toBe('model');
   expect(m.roughnessMap).toBeInstanceOf(Texture);expect(m.metalnessMap).toBe(m.roughnessMap);
   expect(m.aoMap).toBeNull();expect(m.metalness).toBe(1);
   const shader={uniforms:{},vertexShader:ShaderLib.standard.vertexShader,fragmentShader:ShaderLib.standard.fragmentShader};
   m.onBeforeCompile(shader as never,{} as never);
   expect(shader.fragmentShader).toContain('float sourceSpecularMultiplier=1.;');
   expect(shader.fragmentShader).not.toContain('float sourceSpecularMultiplier=max(');
  }
 });expect(shaded).toBeGreaterThan(0);ground.dispose();macro.dispose();
});

it('composes source foliage normals after instance transforms without dropping direct-light suppression',async()=>{
 const {scene}=await load('trees','fir-a'),ground=new ReferenceGround(),macro=new Texture();
 expect(prepareReferencePlants(scene,ground,()=>macro)).toBe(true);
 let foliage=0;
 scene.traverse(node=>{
  if(!(node instanceof Mesh))return;
  for(const material of Array.isArray(node.material)?node.material:[node.material]){
   const m=material as MeshStandardMaterial;if(!m.userData.foliage)continue;foliage++;
   const shader={uniforms:{},vertexShader:ShaderLib.standard.vertexShader,fragmentShader:ShaderLib.standard.fragmentShader};
   m.onBeforeCompile(shader as never,{} as never);
   expect(shader.vertexShader.indexOf('mat3 crownRotation')).toBeGreaterThan(shader.vertexShader.indexOf('#include <defaultnormal_vertex>'));
   expect(shader.vertexShader).not.toContain('objectNormal=mix(objectNormal,crownNormal');
   expect(shader.vertexShader).toContain('transformedTangent=mix(');
   expect(shader.fragmentShader).not.toContain('// SOURCE_SPECULAR_MULTIPLIER');
   expect(shader.fragmentShader).toContain('float sourceSpecularMultiplier=max(1.-(');
   expect(shader.fragmentShader).toContain('*sourceSpecularMultiplier;');
   expect(shader.fragmentShader).toContain('reflectedLight.directDiffuse+=');
  }
 });expect(foliage).toBeGreaterThan(0);ground.dispose();macro.dispose();
});

it('preserves raised source underlays and selects plant versus model terrain snapping',async()=>{
 const ground=new ReferenceGround(),macro=new Texture();
 for(const [id,family] of [['lying-snag-a','plant'],['neutral-bandit-tent','model']] as const){
  const {scene}=await load('props',id);prepareReferencePlants(scene,ground,()=>macro);
  let underlays=0,relief=0;
  scene.traverse(node=>{
   if(!(node instanceof Mesh))return;
   const m=node.material as MeshStandardMaterial;if(!m.userData.underlay)return;underlays++;
   const p=node.geometry.getAttribute('position');let min=Infinity,max=-Infinity;
   for(let i=0;i<p.count;i++){min=Math.min(min,p.getY(i));max=Math.max(max,p.getY(i));}
   relief=Math.max(relief,max-min);
   expect(m.userData.sourceShader).toBe(family);
   const shader={uniforms:{},vertexShader:ShaderLib.standard.vertexShader,fragmentShader:ShaderLib.standard.fragmentShader};
   m.onBeforeCompile(shader as never,{} as never);
   expect(shader.vertexShader).not.toContain('referenceHeight(referenceWorld.xz)+.018');
   if(family==='plant'){
    expect(shader.vertexShader).toContain('dot(referenceWorld.xyz-referenceTransform[3].xyz,referenceUp)');
    expect(shader.vertexShader).toContain('normalize(referenceTransform[1].xyz)');
   }else{
    expect(shader.vertexShader).toContain('clamp((position.y-2.)/2.,0.,1.)');
    expect(shader.vertexShader).not.toContain('vec3 referenceUp=');
   }
  });
  expect(underlays).toBeGreaterThan(0);expect(relief).toBeGreaterThan(.6);
 }
 ground.dispose();macro.dispose();
});
