import { sampleCurve, type CurvePoint } from './curve';
export type RiverStroke={points:CurvePoint[];radius:number;depth:number};
/** World-space flow directions, encoded in RG for bilinear shader sampling. */
export function riverFlow(rivers:readonly RiverStroke[],size:number,origin:number,span:number):Uint8Array {
  const segments=rivers.flatMap(r=>{const p=sampleCurve(r.points,r.radius,2);return p.slice(0,-1).map((a,i)=>({a,b:p[i+1]!}));});
  const data=new Uint8Array(size*size*4);
  for(let z=0;z<size;z++)for(let x=0;x<size;x++){
    const wx=origin+(x+.5)*span/size,wz=origin+(z+.5)*span/size;
    let best=Infinity,fx=.6,fz=.8;
    for(const {a,b} of segments){
      const dx=b.x-a.x,dz=b.z-a.z,len2=dx*dx+dz*dz;if(len2<1e-8)continue;
      const t=Math.max(0,Math.min(1,((wx-a.x)*dx+(wz-a.z)*dz)/len2));
      const d=(wx-a.x-dx*t)**2+(wz-a.z-dz*t)**2;
      if(d<best){best=d;const len=Math.sqrt(len2);fx=dx/len;fz=dz/len;}
    }
    const i=(z*size+x)*4;data[i]=Math.round((fx*.5+.5)*255);data[i+1]=Math.round((fz*.5+.5)*255);data[i+2]=0;data[i+3]=255;
  }
  return data;
}
