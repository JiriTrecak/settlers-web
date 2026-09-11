import {describe,it,expect} from 'vitest';
import {CurveIndex} from '../../src/shared/landscape/curveIndex';
import {curveDistance,sampleCurve} from '../../src/shared/landscape/curve';
describe('paint segment broad phase',()=>{
 it('preserves curved, variable-width, overlapping and negative-coordinate brush weights',()=>{
  const curves=[sampleCurve([{x:-20,z:4,radius:.1},{x:30,z:15,radius:20},{x:5,z:35,radius:2}],4,1),sampleCurve([{x:16,z:16}],8),[]];
  for(const curve of curves){const index=new CurveIndex(curve);for(let z=-25;z<65;z+=1.7)for(let x=-40;x<70;x+=1.9)expect(index.distance(x,z)).toBeCloseTo(Math.min(1,curveDistance(x,z,curve)),12);}
 });
});
