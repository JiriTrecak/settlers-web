import { afterEach, describe, expect, it, vi } from 'vitest';
import { Scene, DirectionalLight } from 'three';
import { FOREST, environmentPreset, saveEnvironmentPreset, validLight } from '../../src/shared/environment/presets';
import { Sky } from '../../src/render/sky/sky';
afterEach(()=>vi.unstubAllGlobals());
describe('environment presets',()=>{
  it('persists a shared preset and leaves drafts independent',()=>{
    const data=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v)});
    const draft=environmentPreset();draft.light.sunStrength=.5;expect(environmentPreset().light.sunStrength).toBe(FOREST.light.sunStrength);
    saveEnvironmentPreset(draft);expect(environmentPreset().light.sunStrength).toBe(.5);
    draft.light.sunStrength=2;expect(environmentPreset().light.sunStrength).toBe(.5);
    expect(validLight({...draft.light,hazeDistance:NaN})).toBe(false);
    expect(validLight({...draft.light,sunTint:'red'})).toBe(false);
  });
  it('applies live daylight edits while retaining a running 240 second clock',()=>{
    const scene=new Scene(),sky=new Sky(scene);sky.setHour(9);
    const sun=scene.children.find(o=>o instanceof DirectionalLight) as DirectionalLight;
    const before=sun.intensity,position=sun.position.clone();
    sky.setGlobalLight({...FOREST.light,sunStrength:.5,sunDirection:35});
    expect(sun.intensity).toBeCloseTo(before*.5/FOREST.light.sunStrength);expect(sun.position.distanceTo(position)).toBeGreaterThan(1);
    sky.setPlaying(true);sky.tick(1000);sky.tick(121000);expect(sky.hour).toBeCloseTo(21);sky.tick(241000);expect(sky.hour).toBeCloseTo(9);
  });
});
