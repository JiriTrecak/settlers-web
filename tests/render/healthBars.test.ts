import {expect,it} from 'vitest';
import {Group,OrthographicCamera,PerspectiveCamera,Vector3} from 'three';
import {VitalBar,vitalBarSize} from '../../src/render/settlement/healthBars';
import {healthColor,healthRatio} from '../../src/presentation/health';

it('uses continuous health colour and clamps invalid or overflowing values',()=>{
 expect(healthColor(0,400)).toBe(0xdb3935);
 expect(healthColor(200,400)).toBe(0xe8bf32);
 expect(healthColor(400,400)).toBe(0x64cc39);
 expect(healthColor(199,400)).not.toBe(healthColor(200,400));
 expect(healthColor(800,400)).toBe(healthColor(400,400));
 expect(healthRatio(1,0)).toBe(0);expect(healthRatio(NaN,400)).toBe(0);
 expect(healthRatio(-1,400)).toBe(0);
});

it('keeps the same projected pixel dimensions across camera modes, FOV, zoom, resolution and parent scales',()=>{
 const root=new Group(),bar=new VitalBar(false);root.add(bar);bar.setValues({hp:340,maxHp:400,mana:50,maxMana:100});
 for(const camera of [new PerspectiveCamera(34,16/9,.1,2000),new PerspectiveCamera(75,16/9,.1,2000),new OrthographicCamera(-50,50,40,-40,.1,2000)]){
  for(const depth of [4,40,400])for(const height of [720,1440])for(const scale of [1,2.7]){
   root.position.z=-depth;root.scale.set(scale,scale*.8,scale);root.updateMatrixWorld(true);
   camera.zoom=1.4;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
   bar.fitCamera(camera,height);
   const worldScale=bar.getWorldScale(new Vector3());
   const divisor=camera instanceof PerspectiveCamera?depth:1;
   const pxY=worldScale.y*camera.projectionMatrix.elements[5]*height/2/divisor;
   const pxX=worldScale.x*camera.projectionMatrix.elements[5]*height/2/divisor;
   expect(pxY).toBeCloseTo(15,5);expect(pxX).toBeCloseTo(52,5);
  }
 }
 bar.dispose();
});

it('adds mana only for a positive mana capacity, keeping one material for all health changes',()=>{
 const bar=new VitalBar(false),material=bar.material;
 bar.setValues({hp:400,maxHp:400});expect(vitalBarSize(false).y).toBe(8);
 bar.setValues({hp:1,maxHp:400,mana:0,maxMana:100});expect(vitalBarSize(false,100).y).toBe(15);
 expect(bar.material).toBe(material);expect(material.map).toBeNull();
 expect(vitalBarSize(true).x).toBe(76);bar.dispose();
});
