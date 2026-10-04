import {expect,it} from 'vitest';
import {Footprints} from '../../src/shared/authoring/footprints';

it('matches brute-force exclusion circles across negative cells, boundaries, and large landmarks',()=>{
 const index=new Footprints(),circles:{x:number;z:number;r:number}[]=[];
 let seed=37;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
 const add=(x:number,z:number,r:number)=>{index.add(x,z,r);circles.push({x,z,r});};
 add(-32,48,40);add(24,-16,0);add(0,0,1);add(8,8,2);
 for(let i=0;i<300;i++){
  if(i%3===0)add(random()*256-128,random()*256-128,random()*6);
  for(let j=0;j<12;j++){
   const x=random()*320-160,z=random()*320-160,r=j===0?24:random()*3;
   expect(index.intersects(x,z,r)).toBe(circles.some(p=>Math.hypot(x-p.x,z-p.z)<r+p.r));
  }
 }
 const tangent=new Footprints();tangent.add(8,0,2);
 for(const x of [4,4-1e-12,4+1e-12,12,12-1e-12,12+1e-12])expect(tangent.intersects(x,0,2)).toBe(Math.abs(x-8)<4);
});
