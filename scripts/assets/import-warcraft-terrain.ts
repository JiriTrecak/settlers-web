/** Import supplied replacements, filling absent channels from a local Reforged
 * extraction. Ground assets are independent; no runtime pack/source dependency. */
import {readFile,mkdir,readdir,access} from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import sharp from 'sharp';
import Slk from 'mdx-m3-viewer/dist/cjs/parsers/slk/file';
import {originalPackage,addBytes,publishOriginals} from './original-publication';
import {decodeGroundDds,warcraftGroundLayout} from './warcraft/dds';
import {packGroundAtlas} from './warcraft/pack';

const args=process.argv.slice(2),option=(name:string)=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
const replacement=option('--replacement'),installed=option('--installed'),extractor=option('--extractor'),tiles=option('--tiles')?.split(',');
if(!replacement||!installed||!extractor)throw Error('Usage: import-warcraft-terrain.ts --replacement <folder containing terrainart> --installed <Warcraft .build.info> --extractor <CASC extractor> [--tiles Ldrt,Lgrs,...]');
const cache=path.resolve('.asset-work/imports/warcraft-terrain');await mkdir(cache,{recursive:true});
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const run=promisify(execFile);
async function extract(name:string){
 const target=path.join(cache,sha(Buffer.from(name))+'.bin');
 // Re-extract on each import: a local game update must not silently reuse old pixels.
 await run(extractor!,[installed!,name,target],{maxBuffer:1024*1024});
 return readFile(target);
}
const tableBytes=await extract('war3.w3mod:terrainart\\terrain.slk');
const Table=(Slk as unknown as {default?:typeof Slk}).default??Slk;
const table=new Table();table.load(tableBytes.toString());
const headers=table.rows[0]!,records=table.rows.slice(1).filter(Boolean).map(row=>Object.fromEntries(headers.map((key,i)=>[key,row[i]])));
const overrides=new Map<string,string>();
async function scan(folder:string){for(const entry of await readdir(folder,{withFileTypes:true})){const file=path.join(folder,entry.name);if(entry.isDirectory())await scan(file);else if(entry.name.toLowerCase().endsWith('.dds'))overrides.set(path.relative(replacement!,file).replaceAll(path.sep,'/').toLowerCase(),file);}}
await scan(path.join(replacement,'terrainart'));
const selected=records.filter(r=>tiles?tiles.includes(r.tileID!):['diffuse','normal','orm'].some(c=>overrides.has((r.dir+'/'+r.file+'_'+c+'.dds').replaceAll('\\','/').toLowerCase())));
if(tiles?.some(id=>!selected.some(r=>r.tileID===id)))throw Error('Unknown requested Warcraft ground tile');
if(!selected.length)throw Error('No terrain replacements matched installed ground definitions');
const assets=[];
for(const record of selected){
 const sourcePath=(record.dir+'/'+record.file).replaceAll('\\','/').toLowerCase();
 if(!/^[a-z0-9_/-]+$/.test(sourcePath)||sourcePath.includes('..'))throw Error('Invalid source terrain path');
 const sources=[];
 for(const channel of ['diffuse','normal','orm'] as const){
  const relative=sourcePath+'_'+channel+'.dds',override=overrides.get(relative),archive='war3.w3mod:_hd.w3mod:'+relative.replaceAll('/','\\');
  const bytes=override?await readFile(override):await extract(archive);
  sources.push({channel,bytes,pixels:decodeGroundDds(bytes,channel==='normal'),origin:override?'replacement':'installed-reforged',path:override?relative:archive,sha256:sha(bytes)});
 }
 const [diffuse,normal,orm]=sources as [typeof sources[number],typeof sources[number],typeof sources[number]];
 const {width,height}=diffuse.pixels,atlas=warcraftGroundLayout(width,height);
 if(sources.some(s=>s.pixels.width!==width||s.pixels.height!==height))throw Error('Ground channel atlas dimensions differ: '+sourcePath);
 const id='asset.terrain.warcraft-'+record.tileID!.toLowerCase();
 const asset=originalPackage(id,`${record.comment} · ${record.dir!.split('\\').at(-1)}`,'terrain-material');
 asset.definition.tags=['warcraft','ground',record.tileID!];
 asset.definition.provenance={method:'import',licenseNote:'User-supplied Rebirth replacements with missing channels from the local Warcraft III: Reforged installation. Original sources retain their respective rights.',sourceHash:sha(Buffer.concat(sources.map(s=>s.bytes)))};
 asset.definition.terrain={tileWorldSize:4,reflectance:.25,sourceIds:[record.tileID!],atlas,albedo:{role:'albedo',index:1},normal:{role:'normal',index:1},occlusion:{role:'occlusion',index:1},roughness:{role:'roughness',index:1},metalness:{role:'metalness',index:1},thumbnail:{role:'image',index:1},runtime:{albedoRoughness:{role:'data',index:1},normalOpacity:{role:'data',index:2},occlusionMetalness:{role:'data',index:3}}};
 const packed=await packGroundAtlas(width,height,diffuse.pixels.rgba,normal.pixels.rgba,orm.pixels.rgba);
 for(const [i,bytes] of Object.values(packed).entries())addBytes(asset,'data','bin',gzipSync(bytes),i+1);
 const encode=(rgba:Buffer)=>sharp(rgba,{raw:{width,height,channels:4}}).png().toBuffer();
 addBytes(asset,'albedo','png',await encode(diffuse.pixels.rgba));
 addBytes(asset,'normal','png',await encode(normal.pixels.rgba));
 for(const [i,role] of (['occlusion','roughness','metalness'] as const).entries()){
  const values=Buffer.alloc(width*height);for(let j=0;j<values.length;j++)values[j]=orm.pixels.rgba[j*4+i]!;
  addBytes(asset,role,'png',await sharp(values,{raw:{width,height,channels:1}}).png().toBuffer());
 }
 const tileSize=height/atlas.rows,preview=atlas.fullTiles[0]!;
 const thumbnail=await sharp(diffuse.pixels.rgba,{raw:{width,height,channels:4}}).extract({left:(preview%atlas.columns)*tileSize,top:Math.floor(preview/atlas.columns)*tileSize,width:tileSize,height:tileSize}).resize(160,160).png().toBuffer();
 addBytes(asset,'image','png',thumbnail);
 for(const [i,source] of sources.entries())addBytes(asset,'source','bin',source.bytes,i+1);
 addBytes(asset,'source','json',Buffer.from(JSON.stringify({version:1,tileId:record.tileID,tableSha256:sha(tableBytes),sources:sources.map(({bytes,pixels,...metadata})=>metadata),packing:{atlas:'Uncropped original layout and diffuse alpha',normal:'BC5 XY expanded to positive Z; RGBA normal sources retained',orm:'R = occlusion, G = roughness, B = metalness'},sourceTerrainDefinition:record},null,2)+'\n'),4);
 for(const resource of asset.definition.resources)if(['albedo','normal','roughness','occlusion','metalness','image'].includes(resource.role))resource.colorSpace=['albedo','image'].includes(resource.role)?'srgb':'none';
 assets.push(asset);
 console.log(`${record.tileID}: ${sources.map(s=>`${s.channel}=${s.origin}`).join(', ')}`);
}
await access(installed); // Detect an unavailable source before committing the new catalogue.
await publishOriginals(assets);
