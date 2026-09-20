import {BoxGeometry} from 'three';
import sharp from 'sharp';
import {assetDefinitionSchema,type AssetDefinition} from '../../../../src/shared/authoring/asset';
import {hash} from '../storage';
export const MISSING_MODEL_ID='asset.placeholder.missing-model';
/** Deliberately diagnostic, deterministic art: no external image/model dependencies. */
export async function missingModelPackage():Promise<{asset:AssetDefinition;geometry:Buffer;albedo:Buffer}>{
 const albedo=await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#ed27bd"/><path d="M0 0h128v128H0zm128 128h128v128H128z" fill="#292532"/><rect x="12" y="87" width="232" height="82" rx="5" fill="#151319"/><text x="128" y="137" text-anchor="middle" font-family="sans-serif" font-size="36" font-weight="bold" fill="white">MISSING</text><path d="M4 4h248v248H4z" fill="none" stroke="white" stroke-width="4"/></svg>`)).png().toBuffer();
 const chunks:Buffer[]=[],views:{buffer:number;byteOffset:number;byteLength:number}[]=[],accessors:object[]=[];let length=0;
 const add=(bytes:Buffer)=>{const index=views.length;views.push({buffer:0,byteOffset:length,byteLength:bytes.length});const padded=Buffer.alloc(Math.ceil(bytes.length/4)*4);bytes.copy(padded);chunks.push(padded);length+=padded.length;return index;};
 const floats=(values:ArrayLike<number>,type:string,count:number,min?:number[],max?:number[])=>{const a=Float32Array.from(values),index=accessors.length;accessors.push({bufferView:add(Buffer.from(a.buffer)),componentType:5126,type,count,...(min?{min}:{}),...(max?{max}:{})});return index;};
 const box=new BoxGeometry(1,1,1);box.translate(0,.5,0);
 const position=floats(box.attributes.position.array,'VEC3',24,[-.5,0,-.5],[.5,1,.5]),normal=floats(box.attributes.normal.array,'VEC3',24),uv=floats(box.attributes.uv.array,'VEC2',24);
 const indices=accessors.length,indexData=Uint16Array.from(box.index!.array);accessors.push({bufferView:add(Buffer.from(indexData.buffer)),componentType:5123,type:'SCALAR',count:indexData.length});box.dispose();
 const image=add(albedo),time=floats([0,1],'SCALAR',2,[0],[1]);
 const animation=(name:string,path:string,values:number[],type:string)=>({name,samplers:[{input:time,output:floats(values,type,2),interpolation:'LINEAR'}],channels:[{sampler:0,target:{node:0,path}}]});
 const animations=[animation('hit','rotation',[0,0,0,1,0,0,0,1],'VEC4'),animation('fall','rotation',[0,0,0,1,0,0,Math.SQRT1_2,Math.SQRT1_2],'VEC4'),animation('decay','translation',[0,0,0,0,-2,0],'VEC3')];
 const data={asset:{version:'2.0',generator:'Under the Canopy missing-model generator'},extensionsUsed:['KHR_materials_unlit'],scene:0,scenes:[{nodes:[0]}],nodes:[{name:'MissingModel',mesh:0,extras:{missingModel:true}}],meshes:[{primitives:[{attributes:{POSITION:position,NORMAL:normal,TEXCOORD_0:uv},indices,material:0}]}],materials:[{name:'Missing model',pbrMetallicRoughness:{baseColorTexture:{index:0},roughnessFactor:1,metallicFactor:0},extensions:{KHR_materials_unlit:{}}}],textures:[{source:0}],images:[{bufferView:image,mimeType:'image/png'}],animations,accessors,bufferViews:views,buffers:[{byteLength:length}]};
 const json=Buffer.from(JSON.stringify(data)),jsonPadded=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(jsonPadded);const binary=Buffer.concat(chunks),geometry=Buffer.alloc(28+jsonPadded.length+binary.length);
 geometry.write('glTF');geometry.writeUInt32LE(2,4);geometry.writeUInt32LE(geometry.length,8);geometry.writeUInt32LE(jsonPadded.length,12);geometry.writeUInt32LE(0x4e4f534a,16);jsonPadded.copy(geometry,20);geometry.writeUInt32LE(binary.length,20+jsonPadded.length);geometry.writeUInt32LE(0x004e4942,24+jsonPadded.length);binary.copy(geometry,28+jsonPadded.length);
 const asset=assetDefinitionSchema.parse({version:1,id:MISSING_MODEL_ID,name:'Missing model',kind:'prop',status:'published',revision:1,tags:['placeholder','diagnostic'],usesGeometry:true,resources:[{role:'geometry',index:1,format:'glb',sha256:hash(geometry),bytes:geometry.length},{role:'albedo',index:1,format:'png',sha256:hash(albedo),bytes:albedo.length}],bindings:{scenery:[{id:'missing-model',name:'Missing model',category:'other',type:'prop',geometry:{role:'geometry',index:1}}]},capabilities:{groundContact:{mode:'pivot'}},provenance:{method:'authored',licenseNote:'Procedural diagnostic placeholder authored for this project.'}});
 return {asset,geometry,albedo};
}
