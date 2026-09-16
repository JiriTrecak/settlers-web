import {expect,it} from 'vitest';
import {Scene} from 'three';
import {canopyMask,CanopyLayer} from '../../src/render/atmosphere/canopyLayer';
import {DEFAULT_CANOPY,canopySchema} from '../../src/shared/landscape/canopy';
import {emptyLandscape,parseLandscape} from '../../src/shared/landscape/curve';
it('gives reproducible coverage rather than seed-dependent opaque forests',()=>{
 const a=canopyMask(64,.72,41),b=canopyMask(64,.72,41),other=canopyMask(64,.72,42);
 expect(a).toEqual(b);expect(a).not.toEqual(other);
 let opaque=0;for(let i=1;i<a.length;i+=4)if(a[i]!>=128)opaque++;
 expect(opaque/4096).toBeCloseTo(.72,2);
});
it('casts shadows without occluding the camera or corrupting scene depth; freezes when speed is zero',()=>{
 const scene=new Scene(),layer=new CanopyLayer(scene);layer.configure({...DEFAULT_CANOPY,enabled:true,speed:0},256);
 expect(layer.mesh.castShadow).toBe(true);expect(layer.mesh.material.colorWrite).toBe(false);expect(layer.mesh.material.depthWrite).toBe(false);
 layer.tick(1000);const offset=layer.mesh.material.alphaMap!.offset.clone();layer.tick(100000);expect(layer.mesh.material.alphaMap!.offset).toEqual(offset);
 layer.configure(undefined,256);expect(layer.mesh.visible).toBe(false);layer.dispose();expect(scene.children).toHaveLength(0);
});
it('persists a bounded optional canopy with map data',()=>{
 const landscape=emptyLandscape();expect(parseLandscape(landscape)?.environment.canopy).toBeUndefined();
 landscape.environment.canopy={...DEFAULT_CANOPY,enabled:true};expect(parseLandscape(JSON.parse(JSON.stringify(landscape)))?.environment.canopy).toEqual(landscape.environment.canopy);
 expect(canopySchema.safeParse({...DEFAULT_CANOPY,scale:0}).success).toBe(false);
 expect(canopySchema.safeParse({...DEFAULT_CANOPY,coverage:Infinity}).success).toBe(false);
});

it('animates bounded cloud transmission and resets disabled canopy shade',()=>{
 const layer=new CanopyLayer(new Scene());
 layer.configure({...DEFAULT_CANOPY,enabled:true,cloudShadow:.4},256);
 layer.tick(1000);const initial=layer.sunTransmission;
 layer.tick(150000);expect(layer.sunTransmission).not.toBe(initial);
 expect(layer.sunTransmission).toBeGreaterThanOrEqual(.6);expect(layer.sunTransmission).toBeLessThanOrEqual(1);
 layer.configure({...DEFAULT_CANOPY,enabled:true,speed:0,cloudShadow:.4},256);
 layer.tick(100);const frozen=layer.sunTransmission;layer.tick(100000);expect(layer.sunTransmission).toBe(frozen);
 layer.configure(undefined,256);expect(layer.sunTransmission).toBe(1);layer.dispose();
});
