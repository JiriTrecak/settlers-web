/** Fixed 3×2 sheet → six 128px icons through the Asset Studio image processor. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {processImage} from '../../tooling/asset-studio/server/images';
import {jobRequestSchema,recordSchema} from '../../tooling/asset-studio/shared/schema';
import {records,writeManifest} from '../../tooling/asset-studio/server/manifest';
const source='art/sources/items/briarwatch-rewards/reference.png';
const labels=['leaf-ledger','vigor-seed','family-ring','healing-draught','mana-draught','healing-scroll'];
for(const [index,slug] of labels.entries()){
 const name=slug.split('-').map(s=>s[0].toUpperCase()+s.slice(1)).join(' '),output=`assets/icons/briar-${slug}.png`;
 const request=jobRequestSchema.parse({submissionId:crypto.randomUUID(),name,slug:`briar-${slug}`,category:'item',profile:'icon',width:128,height:128,prompt:'Original ant-scale inventory item matching our painted wood, leaf and resin palette.',parameters:{background:'opaque'},transform:{crop:{left:index%3*512,top:Math.floor(index/3)*512,width:512,height:512},fit:'contain'}});
 const result=await processImage(process.cwd(),source,output,request);if(result.errors.length)throw Error(result.errors.join('; '));
 const id=`asset.icons.briar-${slug}`,record=recordSchema.parse({version:1,id,name,kind:'icon',tags:['briarwatch','item'],status:'published',revision:1,profile:'icon',outputs:[{role:'image',path:output,sha256:result.outputHash,bytes:result.bytes,width:128,height:128}],render:[{id:`icon.briar.${slug}`,image:output}],scenery:[],source:{path:source,sha256:createHash('sha256').update(readFileSync(source)).digest('hex'),quality:'shared'},origin:{method:'openai'},validation:{checkedAt:new Date().toISOString(),warnings:result.warnings}});
 mkdirSync(`art/records/${id}`,{recursive:true});writeFileSync(`art/records/${id}/asset.json`,JSON.stringify(record,null,2)+'\n');console.log(`${name}: ${result.bytes} bytes`);
}
const path='content/game.json',game=JSON.parse(readFileSync(path,'utf8'));
const bindings={'item.briar-ledger':'leaf-ledger','item.briar-vigor-seed':'vigor-seed','item.briar-rescue-ring':'family-ring','item.briar-healing-draught':'healing-draught','item.briar-mana-draught':'mana-draught','item.briar-healing-scroll':'healing-scroll'};
for(const d of game.definitions??game.entities??[])if(d.id in bindings)d.icon=`icon.briar.${bindings[d.id as keyof typeof bindings]}`;
writeFileSync(path,JSON.stringify(game,null,2)+'\n');await writeManifest(process.cwd(),await records(process.cwd()));
