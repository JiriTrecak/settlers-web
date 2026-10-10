/** Extract declared wall regions from the source cliff-model UV atlases. The
 * native renderer uses editable heightfield faces, not Warcraft MDX meshes. */
import {readFile,mkdir,readdir} from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {z} from 'zod';
import sharp from 'sharp';
import definitions from '../../content/import/warcraft/source.json';
import surfaceJson from '../../content/import/warcraft/cliff-surfaces.json';
import {originalPackage,addBytes,publishOriginals} from './original-publication';
import {decodeGroundDds} from './warcraft/dds';
import {packGroundAtlas} from './warcraft/pack';

const args=process.argv.slice(2),option=(name:string)=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
const installed=option('--installed'),extractor=option('--extractor'),replacement=option('--replacement'),ids=option('--cliffs')?.split(',');
if(!installed||!extractor||!ids?.length)throw Error('Usage: import-warcraft-cliffs.ts --installed <.build.info> --extractor <CASC tool> --cliffs CLdi,CLgr [--replacement <folder>]');
const surfaces=z.record(z.string(),z.object({surfaceRect:z.tuple([z.number().min(0).max(1),z.number().min(0).max(1),z.number().positive().max(1),z.number().positive().max(1)]),tileWorldSize:z.number().positive(),verticalWorldSize:z.number().positive(),startSlope:z.number().nonnegative(),fullSlope:z.number().positive()}).strict()).parse(surfaceJson);
const cliffs=definitions.cliffs as Record<string,{texture:string;overrideTexture:string}>;
const cache=path.resolve('.asset-work/imports/warcraft-cliffs');await mkdir(cache,{recursive:true});
const sha=(data:Uint8Array)=>createHash('sha256').update(data).digest('hex'),run=promisify(execFile),overrides=new Map<string,string>();
async function scan(folder:string){for(const e of await readdir(folder,{withFileTypes:true})){const p=path.join(folder,e.name);if(e.isDirectory())await scan(p);else if(e.name.toLowerCase().endsWith('.dds'))overrides.set(path.relative(replacement!,p).replaceAll(path.sep,'/').toLowerCase(),p);}}
if(replacement)await scan(replacement);
const assets=[];
for(const id of ids){
 const def=cliffs[id],surface=surfaces[id];if(!def||!surface)throw Error('No declared cliff surface for '+id);
 const rect=surface.surfaceRect;if(rect[0]+rect[2]>1||rect[1]+rect[3]>1)throw Error('Cliff surface rectangle exceeds its atlas');
 const sources=[];
 for(const channel of ['diffuse','normal','orm'] as const){
  const relative=(def.texture+'_'+channel+'.dds').replaceAll('\\','/').toLowerCase(),override=overrides.get(relative)??overrides.get((def.overrideTexture+'_'+channel+'.dds').replaceAll('\\','/').toLowerCase());
  const archive='war3.w3mod:_hd.w3mod:'+relative.replaceAll('/','\\'),file=path.join(cache,sha(Buffer.from(archive))+'.dds');
  if(!override)await run(extractor,[installed,archive,file],{maxBuffer:1024*1024});
  const bytes=await readFile(override??file),pixels=decodeGroundDds(bytes,channel==='normal');
  const width=Math.round(pixels.width*rect[2]),height=Math.round(pixels.height*rect[3]);
  const rgba=await sharp(pixels.rgba,{raw:{width:pixels.width,height:pixels.height,channels:4}}).extract({left:Math.round(pixels.width*rect[0]),top:Math.round(pixels.height*rect[1]),width,height}).raw().toBuffer();
  sources.push({channel,bytes,width,height,rgba,path:override?path.relative(replacement!,override):archive,origin:override?'replacement':'installed-reforged',sha256:sha(bytes)});
 }
 const [color,normal,orm]=sources;
 if(sources.some(s=>s.width!==color.width||s.height!==color.height))throw Error('Cliff channel dimensions differ: '+id);
 const asset=originalPackage('asset.terrain.warcraft-cliff-'+id.toLowerCase(),`Cliff face · ${id}`,'terrain-material');
 asset.definition.tags=['warcraft','cliff',id];asset.definition.provenance={method:'import',licenseNote:'User-supplied Rebirth replacements with missing channels from the local Warcraft III: Reforged installation. Original sources retain their respective rights.',sourceHash:sha(Buffer.concat(sources.map(s=>s.bytes)))};
 asset.definition.terrain={tileWorldSize:surface.tileWorldSize,projection:{type:'cliff',verticalWorldSize:surface.verticalWorldSize,startSlope:surface.startSlope,fullSlope:surface.fullSlope},reflectance:.25,sourceIds:[id],atlas:{columns:1,rows:1,fullTiles:[0]},albedo:{role:'albedo',index:1},normal:{role:'normal',index:1},occlusion:{role:'occlusion',index:1},roughness:{role:'roughness',index:1},metalness:{role:'metalness',index:1},thumbnail:{role:'image',index:1},runtime:{albedoRoughness:{role:'data',index:1},normalOpacity:{role:'data',index:2},occlusionMetalness:{role:'data',index:3}}};
 const packed=await packGroundAtlas(color.width,color.height,color.rgba,normal.rgba,orm.rgba);
 for(const [i,data]of Object.values(packed).entries())addBytes(asset,'data','bin',gzipSync(data),i+1);
 for(const s of [color,normal])addBytes(asset,s===color?'albedo':'normal','png',await sharp(s.rgba,{raw:{width:s.width,height:s.height,channels:4}}).png().toBuffer());
 for(const [i,role]of (['occlusion','roughness','metalness'] as const).entries()){
  const values=Buffer.alloc(orm.width*orm.height);for(let j=0;j<values.length;j++)values[j]=orm.rgba[j*4+i];
  addBytes(asset,role,'png',await sharp(values,{raw:{width:orm.width,height:orm.height,channels:1}}).png().toBuffer());
 }
 addBytes(asset,'image','png',await sharp(color.rgba,{raw:{width:color.width,height:color.height,channels:4}}).resize(160,160,{fit:'cover'}).png().toBuffer());
 for(const [i,s]of sources.entries())addBytes(asset,'source','bin',s.bytes,i+1);
 addBytes(asset,'source','json',Buffer.from(JSON.stringify({version:1,cliffId:id,surface,sourceCliffDefinition:def,sources:sources.map(({bytes,rgba,width,height,...s})=>s),projection:'Two vertical world-space planes blended by face direction; slope-gated overlay on editable terrain. Original MDX geometry is not imported.'},null,2)+'\n'),4);
 for(const r of asset.definition.resources)if(['albedo','normal','occlusion','roughness','metalness','image'].includes(r.role))r.colorSpace=['albedo','image'].includes(r.role)?'srgb':'none';
 assets.push(asset);console.log(id,sources.map(s=>s.channel+'='+s.origin).join(', '));
}
await publishOriginals(assets);
