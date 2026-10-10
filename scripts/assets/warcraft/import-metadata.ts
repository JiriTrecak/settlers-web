/** Extract editor import definitions; maps never depend on an installed game. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import Slk from 'mdx-m3-viewer/dist/cjs/parsers/slk/file';
const args=process.argv.slice(2),extractor=args[0],installed=args[1];
if(!extractor||!installed)throw Error('Usage: import-metadata.ts <CASC extractor> <installed .build.info>');
const output='content/import/warcraft';await fs.mkdir(output,{recursive:true});
const cache='.asset-work/imports/warcraft-metadata';await fs.mkdir(cache,{recursive:true});
const hashes:Record<string,string>={};
async function table(name:string){
 const target=path.join(cache,path.basename(name.replaceAll('\\','/')));
 execFileSync(extractor,[installed,'war3.w3mod:'+name,target]);
 const bytes=await fs.readFile(target);hashes[name]=createHash('sha256').update(bytes).digest('hex');
 const C=(Slk as unknown as {default?:typeof Slk}).default??Slk,t=new C();t.load(bytes.toString());
 return t.rows.slice(1).filter(Boolean).map(r=>Object.fromEntries(Array.from(t.rows[0],(key,i)=>[key,r[i]]).filter(([key])=>key)));
}
const units=await table('units\\unitbalance.slk'),destructibles=await table('units\\destructabledata.slk'),water=await table('terrainart\\water.slk'),cliffs=await table('terrainart\\clifftypes.slk');
await fs.writeFile(path.join(output,'source.json'),JSON.stringify({
 units:Object.fromEntries(units.filter(r=>r.unitBalanceID&&Number(r.level)>0).map(r=>[r.unitBalanceID,{level:Number(r.level),name:r['comment(s)']}])),
 trees:destructibles.filter(r=>r.targType?.split(',').includes('tree')).map(r=>r.DestructableID),
 waterOffsets:Object.fromEntries(water.filter(r=>r.waterID).map(r=>[r.waterID[0],Number(r.height)])),
 cliffs:Object.fromEntries(cliffs.filter(r=>r.cliffID).map(r=>[r.cliffID,{groundTile:r.groundTile,texture:r.texDir+'\\'+r.texFile,overrideTexture:r.overrideTexture}])),
 provenance:{source:'Local Warcraft III installation',hashes},
},null,2)+'\n');
