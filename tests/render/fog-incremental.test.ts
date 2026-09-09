import {it,expect} from 'vitest';
import {Scene} from 'three';
import {FogOfWar} from '../../src/render/visibility/fogOfWar';
it('incremental fog blur matches a full two-dimensional blur through reveal, memory and disappearance',()=>{
 const n=24,f=new FogOfWar(n),scene=new Scene(),cells=new Uint8Array(n*n);
 for(let revision=0;revision<8;revision++){
  for(let z=0;z<n;z++)for(let x=0;x<n;x++)cells[z*n+x]=Math.hypot(x-(4+revision*2),z-12)<5?2:cells[z*n+x]?1:0;
  if(revision===7)cells.fill(0);
  f.update({cells,revision,owner:0},scene);
  const pixels=f.texture.image.data as Uint8Array;
  for(let z=0;z<n;z++)for(let x=0;x<n;x++){
   let sum=0;for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++)if(x+dx>=0&&x+dx<n&&z+dz>=0&&z+dz<n){const v=cells[(z+dz)*n+x+dx];sum+=v===2?255:v===1?90:0;}
   expect(Math.abs(pixels[(z*n+x)*4]-Math.round(sum/25))).toBeLessThanOrEqual(1);
  }
 }
 f.dispose();
});
