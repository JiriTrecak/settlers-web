import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { Matrix4, Quaternion, Euler, Vector3, Color } from 'three';
import { writeFileSync, readFileSync } from 'node:fs';
// Three broad, planar boulders compose the foreground island landmark.
const parts=[
 {p:[-1.25,2.1,0],s:[2.3,2.6,2.15],r:[.12,.65,-.18]},
 {p:[1.5,1.7,.25],s:[2.0,2.35,1.95],r:[.14,1.1,.12]},
 {p:[-.4,1.4,1.8],s:[2.4,2.4,1.65],r:[.04,.15,-.06]},
];
function stone(){
 const points=[];
 for(const [y,r,phase] of [[-.8,.68,.05],[-.2,1,0],[.55,.86,.08],[.85,.57,.08]]){
  for(let i=0;i<6;i++){const a=i*Math.PI/3+phase;const radius=r*(1+.09*Math.sin(i*2.8));points.push(new Vector3(Math.cos(a)*radius,y,Math.sin(a)*radius));}
 }
 return new ConvexGeometry(points);
}
const chunks=[],bufferViews=[],accessors=[],meshes=[],nodes=[];let offset=0;
function attr(a){const b=Buffer.from(a.buffer,a.byteOffset,a.byteLength);bufferViews.push({buffer:0,byteOffset:offset,byteLength:b.length});offset+=b.length;chunks.push(b);const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<a.length;i++){min[i%3]=Math.min(min[i%3],a[i]);max[i%3]=Math.max(max[i%3],a[i]);}accessors.push({bufferView:bufferViews.length-1,componentType:5126,count:a.length/3,type:'VEC3',min,max});return accessors.length-1;}
for(const part of parts){const g=stone();g.applyMatrix4(new Matrix4().compose(new Vector3(...part.p),new Quaternion().setFromEuler(new Euler(...part.r)),new Vector3(...part.s)));g.computeVertexNormals();meshes.push({primitives:[{attributes:{POSITION:attr(g.attributes.position.array),NORMAL:attr(g.attributes.normal.array)},material:0}]});nodes.push({mesh:meshes.length-1});}
const c=new Color(0xb4989a);writeFileSync('assets/landscape/reference-rock.gltf',JSON.stringify({asset:{version:'2.0',generator:'Under the Canopy reference rock study'},scene:0,scenes:[{nodes:nodes.map((_,i)=>i)}],nodes,meshes,materials:[{pbrMetallicRoughness:{baseColorFactor:[c.r,c.g,c.b,1],metallicFactor:0,roughnessFactor:1}}],accessors,bufferViews,buffers:[{byteLength:offset,uri:'data:application/octet-stream;base64,'+Buffer.concat(chunks).toString('base64')}]}));
const cat=JSON.parse(readFileSync('assets/catalog.json','utf8'));if(!cat.assets.some(a=>a.id==='reference-rock'))cat.assets.push({id:'reference-rock',name:'Island boulder cluster',category:'terrain',type:'ground',file:'landscape/reference-rock.gltf'});writeFileSync('assets/catalog.json',JSON.stringify(cat,null,2)+'\n');
