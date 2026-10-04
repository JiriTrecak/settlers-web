import {expect,it} from 'vitest';
import {sparseWeights} from '../../src/shared/authoring/sparseWeights';

it('retains original blend order and exact results for overlapping masks, zeros and short masks',()=>{
 const count=400,masks=Array.from({length:40},(_,p)=>Float32Array.from({length:count-p},(_,i)=>i%(p+2)?0:(i%17)/16));
 masks[3][4]=-1;
 const sparse=sparseWeights(masks,count),original=new Float32Array(count),actual=new Float32Array(count);
 for(let i=0;i<count;i++){
  let reference=i/499,optimized=reference;
  const expected:number[]=[];
  for(let p=0;p<masks.length;p++){const w=masks[p][i];if(w>0){expected.push(p);reference=reference*(1-w)+(p%3===0?w:0);}}
  expect([...sparse.layers.slice(sparse.offsets[i],sparse.offsets[i+1])]).toEqual(expected);
  for(let j=sparse.offsets[i];j<sparse.offsets[i+1];j++){const p=sparse.layers[j],w=masks[p][i];optimized=optimized*(1-w)+(p%3===0?w:0);}
  original[i]=reference;actual[i]=optimized;
 }
 expect(actual).toEqual(original);
 expect(sparseWeights([],10)).toEqual({offsets:new Uint32Array(11),layers:new Uint32Array()});
});
