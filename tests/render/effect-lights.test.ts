import {expect,it} from 'vitest';
import {Scene,PointLight,Vector3} from 'three';
import {effectLights} from '../../src/render/abilities/effectLights';
import {EffectPlayer} from '../../src/render/abilities/effectPlayer';
import {visualEffectSchema} from '../../src/content/effects/schema';
const effect=visualEffectSchema.parse({schemaVersion:1,id:'effect.test.light',name:'Light',durationTicks:40,layers:[{id:'light',shape:'light',durationTicks:40,count:1,size:5,height:3,colour:'#ff6600',accent:'#ffffff',intensity:20}]});
it('keeps the scene light layout constant across overlapping players, expiration and disposal',async()=>{
 const scene=new Scene(),pool=effectLights(scene),a=new EffectPlayer(),b=new EffectPlayer();scene.add(a.root,b.root);
 const lights=()=>{const result:PointLight[]=[];scene.traverseVisible(o=>{if(o instanceof PointLight)result.push(o);});return result;};
 const initial=lights();expect(initial).toHaveLength(4);expect(initial.every(l=>l.intensity===0)).toBe(true);
 try{
  await a.prepare([effect]);a.play(effect,{target:{x:2,y:5}});a.update(5);b.play(effect,{target:{x:7,y:9}});b.update(8);
  expect(lights()).toEqual(initial);expect(initial.filter(l=>l.intensity>0)).toHaveLength(2);
  expect(initial[0].position.distanceTo(new Vector3(2,3.035,5))).toBeLessThan(.00001);
  a.clear();expect(initial.filter(l=>l.intensity>0)).toHaveLength(1);
  b.update(41);expect(initial.every(l=>l.intensity===0)).toBe(true);
  a.dispose();b.dispose();expect(lights()).toEqual(initial);
 }finally{a.dispose();b.dispose();pool.dispose();}expect(lights()).toHaveLength(0);
});
it('does not illuminate from delayed or hidden cues, and clears on scene detachment',()=>{
 const scene=new Scene(),pool=effectLights(scene),p=new EffectPlayer();scene.add(p.root);
 const delayed=structuredClone(effect);delayed.layers[0].startTick=20;p.play(delayed);p.update(5);
 const intensity=()=>scene.children.reduce((n,o)=>n+(o instanceof PointLight?o.intensity:0),0);
 expect(intensity()).toBe(0);p.update(25);expect(intensity()).toBeGreaterThan(0);
 p.root.visible=false;p.update(26);expect(intensity()).toBe(0);p.root.visible=true;p.update(27);expect(intensity()).toBeGreaterThan(0);
 p.root.removeFromParent();p.update(28);expect(intensity()).toBe(0);p.dispose();pool.dispose();
});
