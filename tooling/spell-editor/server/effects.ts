import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {canonical} from '../../../src/content/registry';
import {visualEffectSchema,type VisualEffect} from '../../../src/content/effects/schema';
import {readEffectLibrary} from '../../content/effects';
import {commitFiles} from '../../asset-studio/server/transaction';
import {readPublished} from '../../asset-studio/server/authoring/publication';
import {publishedResource} from '../../asset-studio/server/authoring/packages';
const hash=(value:unknown)=>createHash('sha256').update(canonical(value)).digest('hex');
const bytes=(v:unknown)=>Buffer.from(JSON.stringify(v,null,2)+'\n');
export class EffectStore {
 constructor(private root:string){}
 async read(id:string){const document=visualEffectSchema.parse(JSON.parse(await readFile(path.join(this.root,'content/effects',id,'effect.json'),'utf8')));return {document,revision:hash(document)};}
 async list(){let entries;try{entries=await readdir(path.join(this.root,'content/effects'),{withFileTypes:true});}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return [];throw e;}return Promise.all(entries.filter(e=>e.isDirectory()&&e.name.startsWith('effect.')).map(async e=>{const {document,revision}=await this.read(e.name);return {id:document.id,name:document.name,layers:document.layers.length,revision};}));}
 async validate(raw:VisualEffect){const document=visualEffectSchema.parse(raw),assets=await readPublished(this.root)??[];for(const layer of document.layers){if(!layer.texture)continue;const ref=layer.texture,asset=assets.find(a=>a.id===ref.asset),resource=asset?.resources.find(r=>r.role===ref.role&&r.index===ref.index);if(!asset||!resource)throw Error('Missing published texture '+ref.asset);const buffer=await readFile(path.join(this.root,publishedResource(asset,ref)));if(buffer.length!==resource.bytes||createHash('sha256').update(buffer).digest('hex')!==resource.sha256)throw Error('Damaged texture '+ref.asset);}return {valid:true};}
 async save(document:VisualEffect,expectedRevision:string|null){await this.validate(document);let previous:string|null=null;try{previous=(await this.read(document.id)).revision;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}if(previous!==expectedRevision)throw Error('Revision conflict: reload effect before saving');await commitFiles(this.root,[{path:`content/effects/${document.id}/effect.json`,bytes:bytes(document)}]);return {document,revision:hash(document)};}
 async publish(id:string,expectedRevision:string){const {document,revision}=await this.read(id);if(revision!==expectedRevision)throw Error('Revision conflict: reload effect before publishing');await this.validate(document);const library=await readEffectLibrary(this.root);library.effects=library.effects.filter(e=>e.id!==id).concat(document);await commitFiles(this.root,[{path:'content/effects/published.json',bytes:bytes(library)}]);return {published:true,id};}
}
