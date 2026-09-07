import { readFileSync,writeFileSync } from 'node:fs';
import { Color } from 'three';
const p=[],uv=[],normal=[];
// Offset and taper cards so a reed bed has an irregular, leaning silhouette.
for(let k=0;k<5;k++){
 const a=k*2.399,c=Math.cos(a)*(.34+k*.025),s=Math.sin(a)*(.34+k*.025);
 const x=Math.cos(a)*.24,z=Math.sin(a)*.24,h=1.05+(k%3)*.23;
 const leanX=Math.cos(a+.6)*.22,leanZ=Math.sin(a+.6)*.22;
 const v=[x-c,0,z-s,x+c,0,z+s,x+c+leanX,h,z+s+leanZ,x-c,0,z-s,x+c+leanX,h,z+s+leanZ,x-c+leanX,h,z-s+leanZ];
 p.push(...v);uv.push(0,1,1,1,1,0,0,1,1,0,0,0);
 for(let i=0;i<6;i++)normal.push(-Math.sin(a)*.65,.76,Math.cos(a)*.65);
}
const arrays=[new Float32Array(p),new Float32Array(normal),new Float32Array(uv)],views=[],accessors=[];let offset=0;
for(let i=0;i<3;i++){const a=arrays[i];views.push({buffer:0,byteOffset:offset,byteLength:a.byteLength});offset+=a.byteLength;accessors.push({bufferView:i,componentType:5126,count:a.length/(i===2?2:3),type:i===2?'VEC2':'VEC3',...(i===0?{min:[Math.min(...p.filter((_,i)=>i%3===0)),0,Math.min(...p.filter((_,i)=>i%3===2))],max:[Math.max(...p.filter((_,i)=>i%3===0)),1.51,Math.max(...p.filter((_,i)=>i%3===2))]}:{})});}
const c=new Color(0x879477);
const doc={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:1,TEXCOORD_0:2},material:0}]}],materials:[{name:'Leave',doubleSided:true,alphaMode:'MASK',alphaCutoff:.4,pbrMetallicRoughness:{baseColorFactor:[c.r,c.g,c.b,1],baseColorTexture:{index:0},metallicFactor:0,roughnessFactor:1}}],images:[{uri:'data:image/png;base64,'+readFileSync('inspiration/brushes/Grass_Textures/Reeds.png').toString('base64')}],textures:[{source:0}],buffers:[{byteLength:offset,uri:'data:application/octet-stream;base64,'+Buffer.concat(arrays.map(a=>Buffer.from(a.buffer))).toString('base64')}],bufferViews:views,accessors};
writeFileSync('assets/landscape/river-reeds.gltf',JSON.stringify(doc));
const cat=JSON.parse(readFileSync('assets/catalog.json'));if(!cat.assets.some(a=>a.id==='river-reeds'))cat.assets.push({id:'river-reeds',name:'River reeds · repaired',category:'water',type:'water',file:'landscape/river-reeds.gltf'});writeFileSync('assets/catalog.json',JSON.stringify(cat,null,2)+'\n');
