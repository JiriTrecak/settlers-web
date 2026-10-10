import {openWarcraftArchive,constructor} from './archive';
import {readWarcraftObjects} from './objects';
import Units from 'mdx-m3-viewer/dist/cjs/parsers/w3x/unitsdoo/file';
import Doodads from 'mdx-m3-viewer/dist/cjs/parsers/w3x/doo/file';
import Strings from 'mdx-m3-viewer/dist/cjs/parsers/w3x/wts/file';
import {readWarcraftTerrain} from './terrain';
import {readWarcraftInfo} from './info';
/** Import-time source records only. None of these parsers run when a UTC map loads. */
export function readWarcraftMap(bytes:Uint8Array){
 const archive=openWarcraftArchive(bytes);
 const get=(name:string,required=true)=>{
  const file=archive.get(name);if(!file){if(required)throw Error(`Warcraft map is missing ${name}`);return undefined;}
  if(file.block.normalSize>32*1024*1024)throw Error(`Warcraft entry ${name} exceeds the 32 MB import limit`);
  return file.bytes();
 };
 const info=readWarcraftInfo(get('war3map.w3i')!),terrain=readWarcraftTerrain(get('war3map.w3e')!);
 const strings=new (constructor(Strings))(),wts=get('war3map.wts',false);if(wts)strings.load(new TextDecoder().decode(wts));
 const resolve=(s:string)=>strings.getString(s)??s;
 info.name=resolve(info.name).replace(/\|c[0-9a-f]{8}|\|r/gi,'');info.description=resolve(info.description).replace(/\|c[0-9a-f]{8}|\|r/gi,'');
 const units=new (constructor(Units))(),doodads=new (constructor(Doodads))();
 const unitBytes=get('war3mapUnits.doo')!,doodadBytes=get('war3map.doo',false);
 // Bound counts before invoking the third-party record readers.
 for(const [name,data] of [['units',unitBytes],['doodads',doodadBytes]] as const){
  if(!data)continue;if(data.length<16)throw Error(`Truncated Warcraft ${name}`);
  const view=new DataView(data.buffer,data.byteOffset,data.byteLength),count=view.getInt32(12,true);
  if(count<0||count>200000||count>data.length/32)throw Error(`Invalid Warcraft ${name} count`);
 }
 units.load(unitBytes,info.build);if(doodadBytes)doodads.load(doodadBytes,info.build);
 const changes=(name:string)=>{const bytes=get(name,false);return bytes?readWarcraftObjects(bytes,name):[];};
 return {info,terrain,units:units.units,doodads:doodads.doodads,unitChanges:changes('war3map.w3u'),treeChanges:changes('war3map.w3b')};
}
export type WarcraftMap=ReturnType<typeof readWarcraftMap>;
