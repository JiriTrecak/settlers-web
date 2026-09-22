/** Independently authored color curves. No sampled or embedded third-party LUT data. */
import {originalPackage,addBytes,publishOriginals} from './original-publication';
const profiles={
 day:{gamma:[1.20,1.16,1.15],black:[0,0,5],white:[250,246,240],saturation:.97},
 day_to_night:{gamma:[.97,.97,.99],black:[0,0,8],white:[255,254,241],saturation:.97},
 night:{gamma:[.89,.90,.90],black:[0,0,0],white:[255,255,255],saturation:.95},
 night_to_day:{gamma:[1.00,1.00,1.01],black:[2,2,8],white:[255,255,244],saturation:.93},
 winter_day:{gamma:[1.06,1.04,1.02],black:[2,3,7],white:[246,250,255],saturation:.91},
};
const size=32,volumes:Record<string,{size:number;rgba:string}>={};
for(const[id,p]of Object.entries(profiles)){
 const data=Buffer.alloc(size**3*4);
 for(let b=0;b<size;b++)for(let g=0;g<size;g++)for(let r=0;r<size;r++){
  const rgb=[r,g,b].map(v=>v/(size-1)),luma=rgb[0]!*.2126+rgb[1]!*.7152+rgb[2]!*.0722,i=((b*size+g)*size+r)*4;
  for(let c=0;c<3;c++){const x=luma+(rgb[c]!-luma)*p.saturation;data[i+c]=Math.round(p.black[c]!+(p.white[c]!-p.black[c]!)*Math.pow(x,p.gamma[c]!));}data[i+3]=255;
 }
 volumes[id]={size,rgba:data.toString('base64')};
}
const p=originalPackage('asset.texture.woodland-daytime-grades','Woodland daytime color curves','texture','authored');
addBytes(p,'data','json',Buffer.from(JSON.stringify(volumes)+'\n'));
addBytes(p,'generation','json',Buffer.from(JSON.stringify({method:'authored',originalPixels:true,algorithm:'Independent channel curves with luminance-preserving saturation, evaluated on a 32-cube lattice.',profiles},null,2)+'\n'));
await publishOriginals([p]);
