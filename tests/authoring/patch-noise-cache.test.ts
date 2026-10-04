import {expect,it} from 'vitest';
import {patchNoise,patchNoiseSampler} from '../../src/shared/authoring/shapes';

it('preserves exact noise at fractional/negative cells, boundaries and different seeds/scales',()=>{
 for(const seed of [0,2147483647,-31])for(const scale of [.01,.35,12,91]){
  const sample=patchNoiseSampler(seed,'forest.meadow / ž',scale),expected=new Float64Array(500),actual=new Float64Array(500);
  for(let i=0;i<500;i++){const x=i%3?Math.sin(i*71.13)*400:(i-250)*scale,z=i%4?Math.cos(i*91.31)*400:0;expected[i]=patchNoise(seed,'forest.meadow / ž',x,z,scale);actual[i]=sample(x,z);}
  expect(actual).toEqual(expected);
 }
});

it('bounded-cache eviction never changes cell values when revisiting earlier regions',()=>{
 const sample=patchNoiseSampler(41,'dense detail',.25);
 const expected=new Float64Array(30000),actual=new Float64Array(30000);
 for(let i=0;i<30000;i++){const x=i*3.7,z=i%97*4.31;expected[i]=patchNoise(41,'dense detail',x,z,.25);actual[i]=sample(x,z);}
 expect(actual).toEqual(expected);
 for(let i=0;i<500;i++)expect(sample(i*3.7,i%97*4.31)).toBe(expected[i]);
});
