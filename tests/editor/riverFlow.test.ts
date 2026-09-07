import { describe,it,expect } from 'vitest';
import { riverFlow } from '../../src/shared/landscape/riverFlow';
describe('river flow direction field',()=>{
 it('follows authored downstream direction and remains finite with repeated points',()=>{
  const field=riverFlow([{points:[{x:0,z:4},{x:0,z:4},{x:8,z:4}],radius:2,depth:1}],8,0,8);
  for(let i=0;i<field.length;i+=4){expect(field[i]).toBe(255);expect(field[i+1]).toBe(128);expect(field[i+3]).toBe(255);}
  const south=riverFlow([{points:[{x:4,z:8},{x:4,z:0}],radius:2,depth:1}],8,0,8);
  expect(south[1]).toBe(0);
 });
});
