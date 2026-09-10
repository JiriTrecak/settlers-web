import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const source=fs.readFileSync(path.join(dir,'animation-rig.glb'));const len=source.readUInt32LE(12);const doc=JSON.parse(source.subarray(20,20+len));let bin=source.subarray(28+len);const keys=JSON.parse(fs.readFileSync(path.join(dir,'animation-keys.json')));
const crown=doc.nodes.findIndex(n=>n.name==='FallPivot');const stump=doc.nodes.findIndex(n=>n.name==='StumpPivot');if(crown<0||stump<0)throw Error('Missing animation pivots');
function accessor(values,type){const width={SCALAR:1,VEC3:3,VEC4:4}[type];const bytes=Buffer.alloc(values.length*4);values.forEach((v,i)=>bytes.writeFloatLE(v,i*4));const padding=Buffer.alloc((4-bin.length%4)%4);const offset=bin.length+padding.length;bin=Buffer.concat([bin,padding,bytes]);const vi=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length});const a={bufferView:vi,componentType:5126,count:values.length/width,type};if(type==='SCALAR'){a.min=[Math.min(...values)];a.max=[Math.max(...values)];}const ai=doc.accessors.length;doc.accessors.push(a);return ai;}
doc.animations=[];
for(const [name,clip] of Object.entries(keys)){
 const input=accessor(clip.keys.map(k=>k.time),'SCALAR');const samplers=[],channels=[];
 function track(node,property,type,values){const i=samplers.length;samplers.push({input,output:accessor(values,type),interpolation:'LINEAR'});channels.push({sampler:i,target:{node,path:property}});}
 track(crown,'rotation','VEC4',clip.keys.flatMap(k=>[Math.sin(k.angle/2),0,0,Math.cos(k.angle/2)]));
 track(crown,'translation','VEC3',clip.keys.flatMap(k=>[0,k.height,k.depth]));track(crown,'scale','VEC3',clip.keys.flatMap(k=>[k.scale,k.scale,k.scale]));track(stump,'translation','VEC3',clip.keys.flatMap(k=>[0,k.stumpHeight,0]));
 doc.animations.push({name,samplers,channels});
}
doc.buffers=[{byteLength:bin.length}];doc.asset.generator='Olive pine rigid animation pipeline';let j=Buffer.from(JSON.stringify(doc));j=Buffer.concat([j,Buffer.alloc((4-j.length%4)%4,32)]);bin=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);const h=Buffer.alloc(20);h.writeUInt32LE(0x46546c67,0);h.writeUInt32LE(2,4);h.writeUInt32LE(28+j.length+bin.length,8);h.writeUInt32LE(j.length,12);h.writeUInt32LE(0x4e4f534a,16);const bh=Buffer.alloc(8);bh.writeUInt32LE(bin.length,0);bh.writeUInt32LE(0x004e4942,4);fs.writeFileSync(path.join(dir,'olive-pine-animated.glb'),Buffer.concat([h,j,bh,bin]));console.log(doc.animations.map(a=>a.name));
