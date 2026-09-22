/** Original numerical material inputs: periodic waves, cellular caustics, ambient sky and BRDF. */
import sharp from 'sharp';import {gzipSync} from 'node:zlib';import {readFile} from 'node:fs/promises';
import {originalPackage,addBytes,publishOriginals,type OriginalPackage} from './original-publication';
const packs:OriginalPackage[]=[];
const byte=(v:number)=>Math.round(Math.max(0,Math.min(255,v))),tau=Math.PI*2;
function noise(x:number,y:number){return Math.sin(tau*(x*3+y*2)+.3)*.42+Math.sin(tau*(x*7-y*5)+1.7)*.23+Math.sin(tau*(x*13+y*11)+.8)*.12;}
async function png(name:string,size:number,pixel:(x:number,y:number)=>number[]){const raw=Buffer.alloc(size*size*4);for(let y=0;y<size;y++)for(let x=0;x<size;x++)raw.set(pixel(x/size,y/size).map(byte),(y*size+x)*4);const p=originalPackage('asset.texture.'+name,name.replaceAll('-',' '),'texture');addBytes(p,'albedo','png',await sharp(raw,{raw:{width:size,height:size,channels:4}}).png().toBuffer());addBytes(p,'generation','json',Buffer.from(JSON.stringify({method:'generated',recipe:'scripts/assets/publish-environment-data.ts',original:true,size})+'\n'));packs.push(p);return raw;}
await png('woodland-macro',256,(x,y)=>{const n=noise(x,y);return [151+n*86,138+n*65,121+n*46,255];});
await png('winter-macro',256,(x,y)=>{const n=noise(x,y);return [127+n*98,134+n*82,139+n*72,255];});
await png('woodland-waves',256,(x,y)=>{
 const a=tau*(x*7+y*2)+.8*Math.sin(tau*y*3),b=tau*(x*3-y*5)+.45*Math.cos(tau*x*2),c=tau*(x*13+y*9);
 const wave=Math.sin(a)*.52+Math.sin(b)*.32+Math.sin(c)*.16;
 return [128+Math.cos(a)*32+Math.cos(b)*18,128+Math.sin(b)*28+Math.cos(c)*12,90+wave*48,89+wave*19];
});
const sites=Array.from({length:36},(_,i)=>({x:(i%6+.5+.26*Math.sin(i*17.3))/6,y:(Math.floor(i/6)+.5+.26*Math.cos(i*11.7))/6}));
await png('woodland-caustics',256,(x,y)=>{let a=99,b=99;for(const p of sites){const dx=Math.abs(x-p.x),dy=Math.abs(y-p.y),d=Math.hypot(Math.min(dx,1-dx),Math.min(dy,1-dy));if(d<a){b=a;a=d;}else if(d<b)b=d;}const light=Math.exp(-(((b-a)/.009)**2))*80;return [128+noise(x,y)*40,128+noise(y,x)*40,light,255];});
// Self-contained fallback atlas for previews that do not use editable biome terrain.
for(const normal of [false,true]){const ids=['woodland-grass','woodland-soil','woodland-dirt','woodland-rock'];const inputs=[];for(let i=0;i<4;i++){const {gunzipSync}=await import('node:zlib');const raw=gunzipSync(await readFile(`art/assets/asset.terrain.${ids[i]}${normal?'-normal':''}/data.bin`));inputs.push({input:await sharp(raw,{raw:{width:1024,height:1024,channels:4}}).png().toBuffer(),left:i%2*1024,top:Math.floor(i/2)*1024});}const p=originalPackage('asset.texture.woodland-terrain-'+(normal?'nh':'ar'),'Original terrain preview atlas','texture');addBytes(p,'albedo','png',await sharp({create:{width:2048,height:2048,channels:4,background:{r:0,g:0,b:0,alpha:1}}}).composite(inputs).png().toBuffer());packs.push(p);}
// Analytic canopy sky. Roughness progressively converges to the hemispherical mean.
const cubeSize=64,levels=7,parts:Buffer[]=[];
const direction=(face:number,u:number,v:number)=>[[1,-v,-u],[-1,-v,u],[u,1,v],[u,-1,-v],[u,-v,1],[-u,-v,-1]][face]!;
for(let level=0;level<levels;level++){const size=cubeSize>>level,rough=level/(levels-1);for(let face=0;face<6;face++){const raw=Buffer.alloc(size*size*4);for(let y=0;y<size;y++)for(let x=0;x<size;x++){const d=direction(face,(x+.5)/size*2-1,(y+.5)/size*2-1),len=Math.hypot(...d),h=d[1]!/len;const sky=Math.max(0,h),ground=Math.max(0,-h),cloud=Math.max(0,Math.sin(d[0]!/len*7+d[2]!/len*5)*Math.cos(h*5))*(1-rough)*10;const rgb=[150+sky*40-ground*48+cloud,156+sky*45-ground*56+cloud,151+sky*58-ground*62+cloud];raw.set([...rgb.map(v=>byte(v*(1-rough*.1)+151*rough*.1)),255],(y*size+x)*4);}parts.push(raw);}}
const cube=Buffer.concat(parts),p=originalPackage('asset.texture.woodland-reflection','Original woodland reflection sky','texture');addBytes(p,'data','bin',gzipSync(cube));addBytes(p,'data','json',Buffer.from(JSON.stringify({size:cubeSize,levels,decodedBytes:cube.length,faceOrder:['+X','-X','+Y','-Y','+Z','-Z'],method:'Original analytic sky and ground hemispheres, roughness-filtered'})+'\n'),2);packs.push(p);
function radical(n:number){let v=0,step=.5;while(n){v+=(n&1)*step;n>>>=1;step*=.5;}return v;}
const size=64,samples=128,lut=Buffer.alloc(size*size*4);
for(let y=0;y<size;y++)for(let x=0;x<size;x++){
 const ndv=(x+.5)/size,rough=1-(y+.5)/size,a=rough*rough,vx=Math.sqrt(1-ndv*ndv),k=rough*rough/2;let A=0,B=0;
 for(let i=0;i<samples;i++){const phi=tau*i/samples,xi=radical(i),ct=Math.sqrt((1-xi)/(1+(a*a-1)*xi)),st=Math.sqrt(1-ct*ct),hx=Math.cos(phi)*st,hy=Math.sin(phi)*st,hz=ct,vdh=Math.max(0,vx*hx+ndv*hz),lz=2*vdh*hz-ndv;if(lz<=0)continue;const gV=ndv/(ndv*(1-k)+k),gL=lz/(lz*(1-k)+k),g=gV*gL*vdh/Math.max(hz*ndv,.0001),fc=(1-vdh)**5;A+=(1-fc)*g;B+=fc*g;}
 lut.set([byte(A/samples*255),byte(B/samples*255),0,255],(y*size+x)*4);
}
const brdf=originalPackage('asset.texture.woodland-brdf','Original integrated GGX reflectance','texture');addBytes(brdf,'data','bin',gzipSync(lut));addBytes(brdf,'data','json',Buffer.from(JSON.stringify({width:size,height:size,decodedBytes:lut.length,method:'Original deterministic split-sum GGX integration',samples})+'\n'),2);packs.push(brdf);
await publishOriginals(packs);
