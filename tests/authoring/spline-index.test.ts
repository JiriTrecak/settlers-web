import {expect,it} from 'vitest';
import {nearestSpline,sampleBezier,type SplineSample} from '../../src/shared/authoring/shapes';
function brute(x:number,z:number,s:readonly SplineSample[]){
 let best=Infinity,result:ReturnType<typeof nearestSpline>|undefined;
 for(let i=0;i<s.length-1;i++){const p=nearestSpline(x,z,[s[i]!,s[i+1]!]);if(p.offset<best){best=p.offset;result=p;}}
 return result;
}
it('indexed nearest courses match exhaustive queries, including junction ties and distant points',()=>{
 const knots=Array.from({length:30},(_,i)=>({x:20+Math.sin(i)*90,z:i*8,elevation:i*.02,widthScale:1+i%3,depthScale:1,flowScale:1}));
 const curves=[sampleBezier(knots),Array.from({length:32},()=>({x:4,z:7,elevation:2,widthScale:1,depthScale:1,flowScale:1,distance:0}))];
 for(const s of curves)for(let i=0;i<200;i++){const x=Math.sin(i*173)*500,z=Math.cos(i*79)*500;expect(nearestSpline(x,z,s)).toEqual(brute(x,z,s));}
});
