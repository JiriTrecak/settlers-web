/** Source LightMapCompute.fx sprite math, shared by converter and live updates. */
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
export function spriteOcclusion(red:number,u:number,v:number,height:number,intensity:number):[number,number,number,number]{
 let d=1-clamp(Math.hypot((.5-u)*2,(.5-v)*2));d=d*d*(3-2*d);
 const casterHeight=height*d,strength=red*intensity*.8;
 return [1-strength,1-strength*clamp((casterHeight-.5)/1.5),1-strength*clamp((casterHeight-2)/7),clamp(Math.max(casterHeight-9,0)*intensity*.5/8)];
}
export function sampleSprite(bytes:Uint8Array,width:number,height:number,u:number,v:number){
 const px=Math.max(0,Math.min(width-1,u*width-.5)),pz=Math.max(0,Math.min(height-1,v*height-.5)),x=Math.floor(px),z=Math.floor(pz),fx=px-x,fz=pz-z;
 const at=(xx:number,zz:number)=>bytes[Math.min(height-1,zz)*width+Math.min(width-1,xx)]!/255;
 return (at(x,z)*(1-fx)+at(x+1,z)*fx)*(1-fz)+(at(x,z+1)*(1-fx)+at(x+1,z+1)*fx)*fz;
}
