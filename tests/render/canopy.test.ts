import {expect,it} from 'vitest';
import {Scene} from 'three';
import {canopyMask,CanopyLayer} from '../../src/render/atmosphere/canopyLayer';
import {DEFAULT_CANOPY,canopySchema} from '../../src/shared/landscape/canopy';
it('gives reproducible coverage rather than seed-dependent opaque forests',()=>{
 const a=canopyMask(64,.72,41),b=canopyMask(64,.72,41),other=canopyMask(64,.72,42);
 expect(a).toEqual(b);expect(a).not.toEqual(other);
 let opaque=0;for(let i=0;i<a.length;i+=4)if(a[i]!>=128)opaque++;
 expect(opaque/4096).toBeCloseTo(.72,2);
});
it('shares soft transmission without any invisible geometry in the scene or depth buffer',()=>{
 const scene=new Scene(),layer=new CanopyLayer(scene);layer.configure({...DEFAULT_CANOPY,enabled:true,speed:0},256);
 expect(scene.children).toHaveLength(0);expect(layer.frame()?.texture.image.width).toBe(256);
 layer.tick(1000);const offset=layer.frame()!.offset.clone();layer.tick(100000);expect(layer.frame()!.offset).toEqual(offset);
 layer.configure(undefined,256);expect(layer.frame()).toBeUndefined();layer.dispose();expect(scene.children).toHaveLength(0);
});
it('rejects degenerate canopy settings',()=>{
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
