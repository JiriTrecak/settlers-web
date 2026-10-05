import {z} from 'zod';
import sharp from 'sharp';
import {COMMAND_ICON_SIZE} from '../../content/icon';
import {AuthoringStore} from '../../asset-studio/server/authoring/store';
import {assetDefinitionSchema,type AssetDefinition} from '../../../src/shared/authoring/asset';
import {assetCommandSchema} from '../../../src/shared/authoring/commands';
import {documentSchema,spellCommandSchema} from '../shared/protocol';
import {visualEffectSchema} from '../../../src/content/effects/schema';
import {encounterSettingsSchema} from '../../../src/content/abilities/encounter';
import {authoringTools,type AuthoringToolName} from '../shared/authoringTools';
import type {SpellEditorService} from './service';
import type {Credentials} from './credentials';
import type {CanvasBridge} from './canvasBridge';
import {authoringResponse} from './toolResponses';
import {inspectAssetImage} from './assetImage';

export function authoringSchema(section:string){
 const schemas={spell:documentSchema,effect:visualEffectSchema,encounter:encounterSettingsSchema,asset:assetCommandSchema};
 if(section==='commands')return spellCommandSchema.options.map(s=>s.shape.op.value);
 if(section in schemas)return z.toJSONSchema(schemas[section as keyof typeof schemas],{reused:'ref'});
 const command=spellCommandSchema.options.find(s=>s.shape.op.value===section);if(!command)throw Error('Unknown schema. Use commands, spell, effect, encounter, asset, or a command name.');
 return z.toJSONSchema(command,{reused:'ref'});
}
export class AuthoringToolkit {
 private generating=new Set<string>();
 constructor(private service:SpellEditorService,private credentials:Credentials,private canvas:CanvasBridge,private fetcher:typeof fetch=fetch,private previewService:(client?:string)=>SpellEditorService=()=>service){}
 async execute(name:AuthoringToolName,raw:unknown,client?:string,signal?:AbortSignal):Promise<unknown>{
  const input=authoringTools[name].inputSchema.parse(raw);
  if(name==='studio_schema')return authoringSchema((input as {section:string}).section);
  if(name==='studio_author'){const options=authoringTools.studio_author.inputSchema.parse(input),command=spellCommandSchema.parse(JSON.parse(options.commandJson));return authoringResponse(command,await this.previewService(client).execute(command),options);}
  if(name==='studio_canvas'){this.previewService(client);return this.canvas.request(authoringTools.studio_canvas.inputSchema.parse(input),client);}
  if(name==='studio_asset_image'){const ref=authoringTools.studio_asset_image.inputSchema.parse(input);return inspectAssetImage(this.service.root,ref.asset,ref.index);}
  return this.generate(authoringTools.studio_image.inputSchema.parse(input),signal);
 }
 private async generate(input:z.infer<typeof authoringTools.studio_image.inputSchema>,signal?:AbortSignal){
  signal?.throwIfAborted();
  if(this.generating.has(input.id))throw Error('This asset is already being generated. Wait for that request to finish.');
  this.generating.add(input.id);
  try{return await this.generateAsset(input,signal);}finally{this.generating.delete(input.id);}
 }
 private async generateAsset(input:z.infer<typeof authoringTools.studio_image.inputSchema>,signal?:AbortSignal){
  const store=new AuthoringStore(this.service.root);
  try{await store.get(input.id);throw Error('Asset ID already exists. Choose a new ID.');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  const definition=assetDefinitionSchema.parse({version:1,id:input.id,name:input.name,kind:input.kind,revision:1,status:'draft',tags:['spell-effects','generated'],resources:[],usesGeometry:false,provenance:{method:'generated',licenseNote:'Original artwork generated with OpenAI GPT Image 2.5.'},bindings:{render:input.kind==='icon'?[{id:input.id,image:{asset:input.id,role:'image',index:1}}]:[],scenery:[]}});
  const settings=await this.credentials.settings();
  const response=await this.fetcher('https://api.openai.com/v1/images/generations',{method:'POST',headers:{Authorization:'Bearer '+await this.credentials.key(),'Content-Type':'application/json'},body:JSON.stringify({model:settings.imageModel,prompt:input.prompt,background:input.transparent?'transparent':'opaque',output_format:'png',size:'1024x1024',quality:'high',n:1}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(240000)]):AbortSignal.timeout(240000)});
  if(!response.ok)throw Error(`Image generation failed (${response.status}). Check your OpenAI account and model access in Settings.`);
  const data=await response.json() as {data?:{b64_json?:string}[]};const encoded=data.data?.[0]?.b64_json;if(!encoded)throw Error('OpenAI returned no image. No asset was created.');
  const original=Buffer.from(encoded,'base64');if(original.length>30*1024*1024)throw Error('Generated image exceeds the import limit.');
  const size=input.kind==='icon'?COMMAND_ICON_SIZE:512;
  const image=await sharp(original,{limitInputPixels:16777216}).resize(size,size,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
  const meta=await sharp(image).metadata();if(input.transparent&&!meta.hasAlpha)throw Error('The generated image has no alpha channel. Retry with a transparent-background prompt.');
  if(meta.hasAlpha){
   const alpha=(await sharp(image).stats()).channels.at(-1)!;
   if(alpha.max===0)throw Error('The generated image is completely transparent. No asset was created; retry with visible artwork.');
   if(input.transparent&&alpha.min===255)throw Error('The generated image is fully opaque despite its alpha channel. No asset was created; retry with a transparent-background prompt.');
  }
  signal?.throwIfAborted();
  let asset=await store.dispatch({op:'asset.create',definition}) as AssetDefinition;
  for(const [role,bytes,format] of [['source',original,'png'],['image',image,'png'],['generation',Buffer.from(JSON.stringify({provider:'openai',model:settings.imageModel,prompt:input.prompt,transparent:input.transparent,createdAt:new Date().toISOString()})),'json']] as const){asset=await store.dispatch({op:'asset.upload',id:asset.id,expectedRevision:asset.revision,role,index:1,format,base64:bytes.toString('base64')}) as AssetDefinition;}
  asset=await store.dispatch({op:'asset.publish',id:asset.id,expectedRevision:asset.revision}) as AssetDefinition;
  return {asset:asset.id,texture:{asset:asset.id,role:'image',index:1},width:meta.width,height:meta.height,transparent:meta.hasAlpha,image:'data:image/png;base64,'+image.toString('base64'),published:true};
 }
}
