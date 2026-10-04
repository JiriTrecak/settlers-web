import {expect,it} from 'vitest';
import {Box3,Matrix4,Vector3} from 'three';
import {applyAffineBounds} from '../../src/render/prop/affineBounds';
it('matches eight-corner projection exactly for reflection, shear, singular and nonuniform transforms',()=>{
 let seed=37;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32*20-10;};
 for(let i=0;i<1000;i++){
  const box=new Box3(new Vector3(random(),random(),random()),new Vector3(20+random(),20+random(),20+random()));
  const m=new Matrix4().set(random(),random(),random(),random(),random(),random(),random(),random(),random(),random(),random(),random(),0,0,0,1);
  if(i%10===0)m.scale(new Vector3(0,2,-3));
  expect(applyAffineBounds(box.clone(),m)).toEqual(box.clone().applyMatrix4(m));
 }
});
it('retains empty boxes and falls back for perspective transforms',()=>{
 const m=new Matrix4().makePerspective(-1,1,1,-1,.1,100),box=new Box3(new Vector3(-1,-2,-4),new Vector3(2,3,-2));
 expect(applyAffineBounds(box.clone(),m)).toEqual(box.clone().applyMatrix4(m));
 expect(applyAffineBounds(new Box3(),new Matrix4()).isEmpty()).toBe(true);
});
