/** Compile authored records into the only runtime listing and explicit Vite URL imports. */
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {recordSchema,type AssetRecord,type Manifest,type RuntimeRecord} from '../shared/schema';
import {filesIn,json,hash,saveJson,atomic,within} from './storage';
export async function records(root:string):Promise<AssetRecord[]>{const out:AssetRecord[]=[];for(const f of await filesIn(path.join(root,'art/records')))if(f.endsWith('/asset.json')){const raw=await json<unknown>(f);out.push(recordSchema.parse(raw));}return out;}
export function compile(all:AssetRecord[]):Manifest{
 const ids=new Set<string>(),bindings=new Set<string>(),scenery=new Set<string>(),paths=new Map<string,string>();
 const result:RuntimeRecord[]=[];
 for(const record of all.filter(a=>a.status==='published').sort((a,b)=>a.id.localeCompare(b.id))){
  recordSchema.parse(record);if(ids.has(record.id))throw Error('Duplicate asset ID '+record.id);ids.add(record.id);
  for(const b of record.render){if(bindings.has(b.id))throw Error('Duplicate render ID '+b.id);bindings.add(b.id);for(const f of [b.file,b.image,b.harvestAnimation])if(f&&!all.some(a=>a.status==='published'&&a.outputs.some(o=>o.path===f)))throw Error('Undeclared render output '+f);}
  for(const s of record.scenery){if(scenery.has(s.id))throw Error('Duplicate scenery ID '+s.id);scenery.add(s.id);if(!record.outputs.some(o=>o.path==='assets/'+s.file))throw Error('Scenery output mismatch '+s.id);}
  for(const o of record.outputs){if(!o.path.startsWith('assets/'))throw Error('Output must be under assets/');const key=o.path.toLowerCase();if(paths.has(key))throw Error('Duplicate output path '+o.path);paths.set(key,o.path);}
  const {source:_source,origin:_origin,validation:_validation,status:_status,version:_version,...runtime}=record;result.push(runtime);
 }
 return {version:1,records:result};
}
export function urlModule(manifest:Manifest){const paths=[...new Set(manifest.records.flatMap(r=>r.outputs.map(o=>o.path)))].sort();return '/** Generated from assets/manifest.json. Run assets:compile; do not edit. */\n'+paths.map((p,i)=>`import a${i} from ${JSON.stringify('../../../'+p+'?url')};`).join('\n')+'\nexport const assetUrls:Readonly<Record<string,string>> = {\n'+paths.map((p,i)=>`${JSON.stringify(p)}:a${i},`).join('\n')+'\n};\n';}
export async function validateFiles(root:string,manifest:Manifest){for(const r of manifest.records)for(const o of r.outputs){const b=await readFile(await within(root,o.path));if(hash(b)!==o.sha256)throw Error('Unpublished change: '+o.path);}}
export async function writeManifest(root:string,all:AssetRecord[]){const manifest=compile(all);await validateFiles(root,manifest);await saveJson(path.join(root,'assets/manifest.json'),manifest);await atomic(path.join(root,'src/shared/assets/urls.generated.ts'),urlModule(manifest));return manifest;}
