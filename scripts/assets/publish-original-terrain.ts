/** Pack newly authored albedo into terrain AR and derived normal/height channels. */
import sharp from 'sharp';
import {gzipSync} from 'node:zlib';
import {readFile,access} from 'node:fs/promises';
import {originalPackage,addBytes,publishOriginals,type OriginalPackage} from './original-publication';

const names=['woodland-soil','woodland-grass','woodland-dirt','woodland-riverbed','woodland-rock','winter-soil','winter-grass','winter-dirt','winter-rock'];
const requested=process.argv.slice(2),size=1024,packs:OriginalPackage[]=[];
for(const name of names){
 if(requested.length&&!requested.includes(name))continue;
 const dir=`art/sources/textures/${name}`;
 try{await access(dir+'/albedo.png');}catch{if(requested.includes(name))throw Error('Missing original texture '+name);continue;}
 const png=await sharp(dir+'/albedo.png').resize(size,size,{fit:'fill'}).removeAlpha().png().toBuffer();
 const rgb=await sharp(png).raw().toBuffer();
 // These are renderer data channels, not edits of the original artwork.
 const luminance=await sharp(png).greyscale().blur(2).raw().toBuffer();
 const ar=Buffer.alloc(size*size*4),nh=Buffer.alloc(size*size*4);
 const mean=luminance.reduce((sum,v)=>sum+v,0)/luminance.length;
 const deviation=Math.sqrt(luminance.reduce((sum,v)=>sum+(v-mean)**2,0)/luminance.length);
 const heightMean=name.includes('rock')?142:116,heightRange=name.includes('rock')?40:22;
 const height=(x:number,y:number)=>Math.max(0,Math.min(255,heightMean+(luminance[((y+size)%size)*size+(x+size)%size]!-mean)/Math.max(1,deviation)*heightRange));
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=y*size+x,j=i*4;rgb.copy(ar,j,i*3,i*3+3);ar[j+3]=name.includes('riverbed')?205:240;
  const at=(dx:number,dy:number)=>height(x+dx,y+dy)/255;
  const slope=name.includes('grass')?2.4:1.7,nx=(at(-1,0)-at(1,0))*slope,ny=(at(0,-1)-at(0,1))*slope,inv=1/Math.hypot(nx,ny,1);
  nh[j]=Math.round(128+127*nx*inv);nh[j+1]=Math.round(128+127*ny*inv);nh[j+2]=Math.round(128+127*inv);
  nh[j+3]=Math.round(at(0,0)*255);
 }
 if(name==='woodland-rock'){
  const displacement=Buffer.from(nh);
  for(let i=0;i<displacement.length;i+=4){for(let c=0;c<2;c++)displacement[i+c]=Math.max(0,Math.min(255,128+(nh[i+c]!-128)*3));displacement[i+2]=255;displacement[i+3]=Math.max(0,Math.min(255,Math.round(154+(nh[i+3]!-142)*.575)));}
  const p=originalPackage('asset.terrain.woodland-rock-displacement','Original woodland rock displacement','terrain-material');addBytes(p,'data','bin',gzipSync(displacement));packs.push(p);
 }
 const source=JSON.parse(await readFile(dir+'/generation.json','utf8'));
 const provenance=Buffer.from(JSON.stringify({...source,packing:{size,albedo:'Original generated RGB, no color grading or imported pixels',roughness:name.includes('riverbed')?205:240,normalHeight:'Derived from softly filtered original luminance with normalized height contrast; periodic finite differences'}},null,2)+'\n');
 for(const [suffix,bytes]of [['',ar],['-normal',nh]] as const){
  const p=originalPackage('asset.terrain.'+name+suffix,name.replaceAll('-',' ')+(suffix?' · normal/height':' · albedo/roughness'),'terrain-material');
  addBytes(p,'data','bin',gzipSync(bytes,{level:9}));addBytes(p,'generation','json',provenance);
  if(!suffix)addBytes(p,'albedo','png',png);packs.push(p);
 }
}
if(!packs.length)throw Error('No original terrain sources found');
await publishOriginals(packs,(index,changed)=>{
 for(const [recipe,name] of [['recipe.path.grass','woodland-grass'],['recipe.path.soil','woodland-soil']]){
  if(!packs.some(p=>p.definition.id==='asset.terrain.'+name))continue;
  const asset=index.get(recipe)!;
  if(asset.recipe?.type!=='path')throw Error('Expected path recipe '+recipe);
  asset.recipe.material='asset.terrain.'+name;
  asset.provenance={method:'authored',licenseNote:'Original woodland surface recipe and texture.'};
  asset.revision++;changed.add(recipe);
 }
});
