import {withWorkspaceWriteLock} from '../writeLock';
import {readFile,access} from 'node:fs/promises';
import {assetCommandSchema,type AssetCommand} from '../../../../src/shared/authoring/commands';
import {assetDefinitionSchema,assetFolder,resourceFilename,type AssetDefinition,type ResourceRef} from '../../../../src/shared/authoring/asset';
import {authoringId} from '../../../../src/shared/authoring/recipes';
import {hash,json,within} from '../storage';
import {commitFiles} from '../transaction';
import {publishAsset,readPublished,planPublication} from './publication';
import {readPackages,validatePackage} from './packages';
const definitionPath=(id:string)=>assetFolder(id)+'/asset.json';
async function validateUpload(format:string,bytes:Buffer){
 if(!bytes.length||bytes.length>50*1024*1024)throw Error('Resource must be between 1 byte and 50 MiB');
 if(['png','jpeg','webp'].includes(format)){
  const sharp=(await import('sharp')).default,meta=await sharp(bytes,{limitInputPixels:16777216}).metadata();
  if(meta.format!==format||!meta.width||!meta.height)throw Error('Image format does not match its declared role');
 }else if(format==='glb'){
  if(bytes.length<20||bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw Error('Invalid GLB header');
  let offset=12,chunk=0;
  while(offset<bytes.length){if(offset+8>bytes.length)throw Error('Truncated GLB');const length=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4);if(length%4||offset+8+length>bytes.length)throw Error('Invalid GLB chunk');if(!chunk++){if(type!==0x4e4f534a)throw Error('GLB JSON must be first');const data=JSON.parse(bytes.toString('utf8',offset+8,offset+8+length).trim());if(data.asset?.version!=='2.0')throw Error('Expected glTF 2');if([...data.buffers??[],...data.images??[]].some((r:{uri?:string})=>r.uri&&!r.uri.startsWith('data:')))throw Error('GLB must embed its dependencies');}offset+=8+length;}
 }else if(format==='blend'){
  if(bytes.toString('ascii',0,7)!=='BLENDER')throw Error('Expected an uncompressed Blender file');
 }else if(['json','gltf','utcmap'].includes(format)){
  const data=JSON.parse(bytes.toString('utf8'));if(format==='gltf'&&[...data.buffers??[],...data.images??[]].some((r:{uri?:string})=>r.uri&&!r.uri.startsWith('data:')))throw Error('Source glTF must embed its dependencies');
 }else if(format==='svg')throw Error('Upload a raster image; SVG source uploads need sanitization before publication');
}
export class AuthoringStore{
 constructor(private root:string){}
 async get(id:string):Promise<AssetDefinition>{return assetDefinitionSchema.parse(await json(await within(this.root,definitionPath(authoringId.parse(id)))));}
 async resource(id:string,ref:ResourceRef){const a=await this.get(id),r=a.resources.find(r=>r.role===ref.role&&r.index===ref.index);if(!r)throw Error('Resource is not declared');const bytes=await readFile(await within(this.root,assetFolder(id)+'/'+resourceFilename(r)));if(hash(bytes)!==r.sha256)throw Error('Resource changed outside the editor');return {bytes,format:r.format};}
 /** Caller serializes this with other Studio publication operations. */
 async dispatch(input:AssetCommand|unknown):Promise<unknown>{return withWorkspaceWriteLock(this.root,()=>this.execute(input));}
 private async execute(input:AssetCommand|unknown):Promise<unknown>{
  const command=assetCommandSchema.parse(input);
  if(command.op==='asset.list')return readPackages(this.root);
  if(command.op==='asset.publication'){const released=(await readPublished(this.root))?.find(a=>a.id===command.id);return {id:command.id,revision:released?.revision??null};}
  if(command.op==='asset.get')return this.get(command.id);
  if(command.op==='asset.validate'){const a=await this.get(command.id);await validatePackage(this.root,a);const released=await readPublished(this.root);if(released)await planPublication(this.root,[...released.filter(v=>v.id!==a.id),assetDefinitionSchema.parse({...a,status:'published'})],new Set([a.id]));return {valid:true,id:a.id,revision:a.revision,resources:a.resources.length};}
  if(command.op==='asset.create'){
   const a=command.definition;if(a.status!=='draft'||a.revision!==1||a.resources.length)throw Error('Create an empty draft at revision 1, then upload its resources');
   try{await access(await within(this.root,definitionPath(a.id)));throw Error('Asset ID already exists');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
   await this.write(a);return a;
  }
  const current=await this.get(command.op==='asset.save'?command.definition.id:command.id);
  if(current.revision!==command.expectedRevision)throw Error('Asset changed in another editor; reload before saving');
  if(command.op==='asset.publish'||command.op==='asset.archive')return publishAsset(this.root,current,command.op==='asset.archive');
  if(command.op==='asset.save'){
   const next=command.definition;if(JSON.stringify(next.resources)!==JSON.stringify(current.resources))throw Error('Use role uploads to modify resources');if(next.status!==current.status)throw Error('Status changes require publication or archival');
   const saved=assetDefinitionSchema.parse({...next,revision:current.revision+1});await this.write(saved);return saved;
  }
  const {role,index,format}=command,filename=resourceFilename({role,index,format});
  if(index>current.resources.filter(r=>r.role===role).length+1)throw Error('Resource sequences cannot have gaps');
  const bytes=Buffer.from(command.base64,'base64');if(bytes.toString('base64')!==command.base64)throw Error('Malformed base64 upload');await validateUpload(format,bytes);
  const previous=current.resources.find(r=>r.role===role&&r.index===index);
  if(previous&&previous.format!==format)throw Error('Changing a resource format requires a replacement transaction');
  const resource={role,index,format,bytes:bytes.length,sha256:hash(bytes)};
  const resources=[...current.resources.filter(r=>r!==previous),resource].sort((a,b)=>a.role.localeCompare(b.role)||a.index-b.index);
  const next=assetDefinitionSchema.parse({...current,revision:current.revision+1,resources,usesGeometry:resources.some(r=>r.role==='geometry')});
  await commitFiles(this.root,[{path:assetFolder(next.id)+'/'+filename,bytes},{path:definitionPath(next.id),bytes:Buffer.from(JSON.stringify(next,null,2)+'\n')}]);return next;
 }
 private async write(a:AssetDefinition){await commitFiles(this.root,[{path:definitionPath(a.id),bytes:Buffer.from(JSON.stringify(a,null,2)+'\n')}]);}
}
