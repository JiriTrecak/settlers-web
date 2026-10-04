import {describe,expect,it,vi} from 'vitest';
import {Mesh,MeshStandardMaterial,PlaneGeometry,Scene,ShaderLib,Texture,DataTexture,Vector2} from 'three';
import {ForestSurroundingsLayer} from '../../src/render/canopy/forestSurroundings';
import {DEFAULT_CANOPY} from '../../src/shared/landscape/canopy';
import {HeightField} from '../../src/shared/map/height';
import {forestAnchors} from '../../src/shared/landscape/forestSurroundings';
import {BIOMES,biomeById} from '../../src/content/biomes';
import {FogOfWar} from '../../src/render/visibility/fogOfWar';
import {inspectionShotSchema} from '../../src/shared/camera/inspectionShot';

describe('biome forest surrounds',()=>{
 const profile=biomeById('vibrant-forest').surroundings!;
 it('does not load assets while disabled and cancels a pending backdrop before geometry construction',async()=>{
  const scene=new Scene(),layer=new ForestSurroundingsLayer(scene),internal=layer as any;
  const field=new HeightField(256),frame={texture:new DataTexture(),offset:new Vector2(),settings:{...DEFAULT_CANOPY,enabled:true}};
  let finish!:(value:[])=>void;
  const pending=new Promise<[]>(resolve=>{finish=resolve;});
  const load=vi.spyOn(internal,'load').mockReturnValue(pending);
  internal.floorTextures.set(profile.floorTexture,Promise.resolve(new Texture()));
  layer.configure(undefined,field,undefined,false);await layer.ready;
  expect(load).not.toHaveBeenCalled();expect(internal.bark).toBeNull();
  expect(internal.barkReady).toBeUndefined();internal.barkReady=Promise.resolve(new Texture());
  layer.configure(profile,field,frame,false);const building=layer.ready;
  expect(load).toHaveBeenCalled();
  layer.configure(undefined,field,undefined,false);finish([]);await building;
  expect(internal.generated.size).toBe(0);expect(internal.bark).toBeNull();
  expect(internal.root.visible).toBe(false);layer.dispose();expect(scene.children).toHaveLength(0);
 });
 it.each([256,512,1024,2048])('keeps every trunk outside a %s map and bounds the scenery budget',size=>{
  const anchors=forestAnchors(size,731,profile);
  expect(anchors.length).toBeLessThanOrEqual(384);
  for(const a of anchors){
   const clearance=Math.max(-a.x,a.x-size,-a.z,a.z-size);
   expect(clearance).toBeGreaterThan(a.radius+20);
   expect(a.height).toBeGreaterThan(100);
  }
 });
 it('reproduces positions independent of camera movement and ordinary object edits',()=>{
  expect(forestAnchors(256,731,profile)).toEqual(forestAnchors(256,731,profile));
  expect(forestAnchors(256,731,profile)).not.toEqual(forestAnchors(256,732,profile));
 });
 it('assigns the exterior look to every biome, with distinct winter and autumn palettes',()=>{
  for(const biome of BIOMES)expect(biome.surroundings?.trunk).toBeTruthy();
  expect(biomeById('frozen-forest').surroundings?.leafColors).not.toEqual(profile.leafColors);
  expect(biomeById('autumn-forest').surroundings?.leafColors).not.toEqual(profile.leafColors);
 });
 it('exempts only explicitly decorative materials from visibility in warmups and live draws',()=>{
  const fog=new FogOfWar(16),scene=new Scene();
  const world=new MeshStandardMaterial(),scenery=new MeshStandardMaterial();scenery.userData.ignoreVisibility=true;
  const a=new Mesh(new PlaneGeometry(),world),b=new Mesh(new PlaneGeometry(),scenery);scene.add(a,b);
  fog.prepare(scene);fog.prepareDraws({opaque:[{object:a,material:world},{object:b,material:scenery}],transparent:[],transmissive:[]});
  const compile=(m:MeshStandardMaterial)=>{const s={vertexShader:ShaderLib.standard.vertexShader,fragmentShader:ShaderLib.standard.fragmentShader,uniforms:{}};m.onBeforeCompile(s as never,{} as never);return s.fragmentShader;};
  expect(compile(world)).toContain('utcVisibility');expect(compile(scenery)).not.toContain('utcVisibility');fog.dispose();
 });
 it('validates ground-level inspection poses without accepting degenerate cameras',()=>{
  expect(inspectionShotSchema.parse({eye:[1,2,3],target:[10,2,3]}).fov).toBe(55);
  expect(inspectionShotSchema.safeParse({eye:[0,0,0],target:[0,0,0]}).success).toBe(false);
  expect(inspectionShotSchema.safeParse({eye:[Infinity,0,0],target:[0,0,0]}).success).toBe(false);
 });
});
