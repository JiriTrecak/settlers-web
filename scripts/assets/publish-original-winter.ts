/** Winter material variants of our own geometry and textures; no imported source files. */
import {readFile} from 'node:fs/promises';
import {originalPackage,addBytes,addFile,publishOriginals,type OriginalPackage} from './original-publication';
const variants=[
 ['woodland-pine-a','frost-pine-a'],
 ['woodland-pine-b','frost-pine-b'],
 ['woodland-pine-sapling','frost-pine-sapling'],
 ['woodland-moss-boulder','frost-boulder'],
 ['woodland-rock-ledge','frost-rock-ledge'],
 ['woodland-fallen-log','frost-log'],
 ['woodland-grass-messy','frost-grass'],
 ['woodland-grass-low','frost-snow-grass'],
];
const packs:OriginalPackage[]=[];
for(const[src,slug]of variants){
 const base='art/assets/asset.models.environment.'+src,original=JSON.parse(await readFile(base+'/asset.json','utf8'));
 const p=originalPackage('asset.models.environment.'+slug!,slug!.replaceAll('-',' '),original.kind,'authored');
 p.definition.bindings=structuredClone(original.bindings);p.definition.capabilities=structuredClone(original.capabilities);
 for(const binding of p.definition.bindings.render){binding.id='asset.scenery.'+slug;binding.sceneryAsset=slug;for(const k of ['geometry','harvestAnimation'] as const){if(binding[k])binding[k]!.asset=p.definition.id;}}
 for(const binding of p.definition.bindings.scenery){binding.id=slug!;binding.name=p.definition.name;}
 let bytes=await readFile(base+'/geometry.glb'),n=bytes.readUInt32LE(12),d=JSON.parse(bytes.subarray(20,20+n).toString()),binary=bytes.subarray(28+n);
 for(const m of d.materials){m.extras={...m.extras,snowSurface:true};if(src!.includes('grass')){const c=m.pbrMetallicRoughness.baseColorFactor; c[0]*=.85;c[1]*=.92;m.extras.sourceShaderAttributes={...m.extras.sourceShaderAttributes,IsUseGroundColor:'false'};}}
 d.asset.extras={originalVariant:slug,originalBase:src,materialTreatment:'Directional snow from original winter-soil albedo'};
 let json=Buffer.from(JSON.stringify(d));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);const h=Buffer.alloc(20),b=Buffer.alloc(8);h.writeUInt32LE(0x46546c67);h.writeUInt32LE(2,4);h.writeUInt32LE(28+json.length+binary.length,8);h.writeUInt32LE(json.length,12);h.writeUInt32LE(0x4e4f534a,16);b.writeUInt32LE(binary.length);b.writeUInt32LE(0x004e4942,4);
 addBytes(p,'geometry','glb',Buffer.concat([h,json,b,binary]));
 for(const resource of original.resources){if(!['albedo','source'].includes(resource.role))continue;await addFile(p,resource.role,resource.format,base+'/'+resource.role+(resource.index===1?'':'_'+resource.index)+'.'+resource.format,resource.index);}
 addBytes(p,'generation','json',Buffer.from(JSON.stringify({method:'authored',originalBase:original.id,script:'scripts/assets/publish-original-winter.ts',treatment:'Original directional snow shader; underlying authored mesh and textures retained.'},null,2)+'\n'));
 packs.push(p);
}
await publishOriginals(packs);
