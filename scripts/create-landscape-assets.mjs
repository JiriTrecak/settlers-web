import { IcosahedronGeometry, CylinderGeometry, ConeGeometry, Matrix4, Vector3, Quaternion, Color } from 'three';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
mkdirSync('assets/landscape',{recursive:true});
function save(id,parts){
 const chunks=[],views=[],accessors=[],meshes=[],nodes=[];let offset=0;
 function accessor(array,type){const bytes=Buffer.from(array.buffer,array.byteOffset,array.byteLength);views.push({buffer:0,byteOffset:offset,byteLength:bytes.length});chunks.push(bytes);offset+=bytes.length;const count=array.length/(type==='VEC3'?3:1),a={bufferView:views.length-1,componentType:5126,count,type};if(type==='VEC3'){a.min=[Infinity,Infinity,Infinity];a.max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<array.length;i++){a.min[i%3]=Math.min(a.min[i%3],array[i]);a.max[i%3]=Math.max(a.max[i%3],array[i]);}}accessors.push(a);return accessors.length-1;}
 const materials=[];
 for(const [i,p] of parts.entries()){
  let g=p.g.index?p.g.toNonIndexed():p.g; if(p.matrix)g.applyMatrix4(p.matrix);g.computeVertexNormals();
  const pos=accessor(g.attributes.position.array,'VEC3'),normal=accessor(g.attributes.normal.array,'VEC3');
  const c=new Color(p.color);materials.push({name:p.leaf?'Leave':'Stone',pbrMetallicRoughness:{baseColorFactor:[c.r,c.g,c.b,1],metallicFactor:0,roughnessFactor:.95}});
  meshes.push({primitives:[{attributes:{POSITION:pos,NORMAL:normal},material:i}]});nodes.push({mesh:i});
 }
 const data={asset:{version:'2.0',generator:'Under the Canopy landscape workshop'},scene:0,scenes:[{nodes:nodes.map((_,i)=>i)}],nodes,meshes,materials,buffers:[{byteLength:offset,uri:'data:application/octet-stream;base64,'+Buffer.concat(chunks).toString('base64')}],bufferViews:views,accessors};
 writeFileSync(`assets/landscape/${id}.gltf`,JSON.stringify(data));
}
for(let k=0;k<6;k++){
 const g=new IcosahedronGeometry(1,k===5?1:0);const p=g.attributes.position;
 let low=Infinity;
 for(let i=0;i<p.count;i++){
  const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
  const n=1+.14*Math.sin(x*12+z*7+k*4)+.1*Math.cos(y*11+x*4+k);
  p.setXYZ(i,x*n*(1.3+k*.13),y*n*(.85+k*.07),z*n*(1+k*.08));low=Math.min(low,p.getY(i));
 }
 for(let i=0;i<p.count;i++)p.setY(i,p.getY(i)-low-.08);
 save(`river-rock-${k+1}`,[{g,color:[0xa7b3ae,0xb5bab1,0x999fa1,0xc0b6a9,0xa9b6b1,0x9eaaa5][k]}]);
}
function matrix(x,y,z,sx,sy,sz){return new Matrix4().compose(new Vector3(x,y,z),new Quaternion(),new Vector3(sx,sy,sz));}
for(let k=0;k<3;k++){
 const parts=[{g:new CylinderGeometry(.16,.31,4.5,7),color:0x6a5840,matrix:matrix(0,2.25,0,1,1,1)}];
 for(let j=0;j<5;j++)parts.push({g:new ConeGeometry(2.25-j*.32,2.7,9),color:[0x3f7454,0x477d52,0x508757][k],leaf:true,matrix:matrix(Math.sin(j*4+k)*.1,2.4+j*.92,Math.cos(j*3)*.1,1,1,1)});
 save(`woodland-pine-${k+1}`,parts);
}
const cat=JSON.parse(readFileSync('assets/catalog.json','utf8'));
for(let k=1;k<=6;k++){const id=`river-rock-${k}`;if(!cat.assets.some(a=>a.id===id))cat.assets.push({id,name:`River rock ${k}`,category:'terrain',type:'prop',file:`landscape/${id}.gltf`});}
for(let k=1;k<=3;k++){const id=`woodland-pine-${k}`;if(!cat.assets.some(a=>a.id===id))cat.assets.push({id,name:`Woodland pine ${k}`,category:'foliage',type:'prop',file:`landscape/${id}.gltf`});}
writeFileSync('assets/catalog.json',JSON.stringify(cat,null,2)+'\n');
