import { describe,it,expect } from 'vitest';
import { BoxGeometry,Group,Mesh,MeshStandardMaterial } from 'three';
import {prepareVividFoliage,tintVividFoliage} from '../../src/render/prop/vividLook';
function fixture(name:string){const mat=new MeshStandardMaterial({color:0x528932});mat.name=name;const root=new Group();root.add(new Mesh(new BoxGeometry(),mat));prepareVividFoliage(root);return mat;}
describe('authored vivid tree palette',()=>{
 it('changes deciduous leaves through seasons and restores the exact authored summer color',()=>{
  const m=fixture('UTC Broadleaf 1'),original=m.color.clone();
  tintVividFoliage(m,'spring');expect(m.color.equals(original)).toBe(false);
  tintVividFoliage(m,'autumn');expect(m.color.r).toBeGreaterThan(m.color.g);
  tintVividFoliage(m,'summer');expect(m.color.equals(original)).toBe(true);
 });
 it('keeps pine evergreen and applies explicit variants without leaking into later changes',()=>{
  const m=fixture('UTC Emerald 2'),original=m.color.clone();
  tintVividFoliage(m,'autumn');expect(m.color.equals(original)).toBe(true);
  tintVividFoliage(m,'summer','snow');expect(m.color.b).toBeGreaterThan(original.b);
  tintVividFoliage(m,'summer');expect(m.color.equals(original)).toBe(true);
 });
 it('does not recolor bark or petals',()=>{
  for(const name of ['UTC Warm bark','UTC Petal purple','UTC Stem']){
   const m=fixture(name),original=m.color.clone();
   expect(tintVividFoliage(m,'autumn','red')).toBe(false);expect(m.color.equals(original)).toBe(true);
  }
 });
});
