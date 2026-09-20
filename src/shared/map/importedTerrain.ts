import { z } from 'zod';

const pair=z.tuple([z.number().finite(),z.number().finite()]);
const dims=z.tuple([z.number().int().min(2).max(4097),z.number().int().min(2).max(4097)]);
const bytes=z.string().regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);
const assetName=z.string().regex(/^[a-z0-9_-]+$/);
/** Lossless source raster/instance payload. It is independent of the coarse navigation grid. */
export const importedTerrainSchema=z.object({
 version:z.literal(1),source:z.string().max(128),sha256:z.string().regex(/^[a-f0-9]{64}$/),
 origin:pair,sourceOrigin:pair,blocks:z.tuple([z.number().int().min(1).max(64),z.number().int().min(1).max(64)]),
 groundColor:z.object({size:dims,rgba:bytes}).optional(),
 displacement:z.object({mask:bytes,texture:assetName,tiling:z.number().positive()}).optional(),
 occlusion:z.object({size:dims,rgba:bytes,dynamic:z.object({
  base:bytes,sprite:z.object({size:dims,red:bytes}),
  plants:z.array(z.object({id:z.string(),asset:assetName,x:z.number().finite(),z:z.number().finite(),scale:z.number().positive(),size:pair,height:z.number().positive(),intensity:z.number().min(0).max(1)})).max(100000),
 }).optional()}).optional(),
 underlayMask:z.object({size:dims,mask:bytes}).optional(),
 heightSize:dims,height:bytes,heightOffset:z.number().finite(),maskSize:dims,
 layers:z.array(z.object({name:assetName,mask:bytes.optional(),ar:assetName,nh:assetName,tiling:z.number().positive(),blend:z.number().finite(),verticality:z.number().finite(),edge:z.number().finite(),desaturation:z.number().finite()})).min(1).max(32),
 /** Six byte layer slots per 4×4 source subblock; 255 means unused. */
 layerSlots:bytes,
 grass:z.array(z.object({asset:assetName,instances:bytes,water:z.boolean().optional()})).max(64),
 water:z.array(z.object({x:z.number().int().nonnegative(),z:z.number().int().nonnegative(),payload:bytes})).max(4096),
}).strict().superRefine((s,ctx)=>{
 const length=(b:string)=>b.length/4*3-(b.endsWith('==')?2:b.endsWith('=')?1:0);
 const fail=(message:string)=>ctx.addIssue({code:'custom',message});
 if(s.heightSize[0]!==s.blocks[0]*48+1||s.heightSize[1]!==s.blocks[1]*48+1||length(s.height)!==s.heightSize[0]*s.heightSize[1]*2)fail('Invalid source height dimensions');
 if(s.maskSize[0]!==s.blocks[0]*24+1||s.maskSize[1]!==s.blocks[1]*24+1)fail('Invalid source mask dimensions');
 if(s.layers.some((l,i)=>i===0?l.mask!==undefined:!l.mask||length(l.mask)!==s.maskSize[0]*s.maskSize[1]))fail('Invalid source layer masks');
 if(length(s.layerSlots)!==s.blocks[0]*s.blocks[1]*16*6)fail('Invalid source subblock layers');
 if(s.groundColor&&length(s.groundColor.rgba)!==s.groundColor.size[0]*s.groundColor.size[1]*4)fail('Invalid source ground-color cache');
 if(s.occlusion&&length(s.occlusion.rgba)!==s.occlusion.size[0]*s.occlusion.size[1]*4)fail('Invalid source occlusion map');
 const dynamic=s.occlusion?.dynamic;
 if(dynamic&&s.occlusion){
  if(length(dynamic.base)!==s.occlusion.size[0]*s.occlusion.size[1]*4)fail('Invalid model occlusion base');
  if(length(dynamic.sprite.red)!==dynamic.sprite.size[0]*dynamic.sprite.size[1])fail('Invalid occlusion sprite');
  if(new Set(dynamic.plants.map(p=>p.id)).size!==dynamic.plants.length)fail('Duplicate occlusion caster ID');
  if(dynamic.plants.some(p=>p.size.some(n=>n<=0)))fail('Invalid occlusion caster size');
  if(s.occlusion.size[0]!==s.blocks[0]*16+1||s.occlusion.size[1]!==s.blocks[1]*16+1)fail('Dynamic occlusion requires one sample per world unit');
 }
 if(s.underlayMask&&length(s.underlayMask.mask)!==s.underlayMask.size[0]*s.underlayMask.size[1])fail('Invalid source underlay mask');
 if(s.displacement&&length(s.displacement.mask)!==s.maskSize[0]*s.maskSize[1])fail('Invalid source displacement mask');
 if(s.grass.some(g=>length(g.instances)%8!==0))fail('Invalid grass instance stride');
 if(s.water.some(w=>w.x>=s.blocks[0]||w.z>=s.blocks[1]||length(w.payload)!==1540))fail('Invalid source water block');
 if(new Set(s.water.map(w=>w.z*s.blocks[0]+w.x)).size!==s.water.length)fail('Duplicate source water block');
 if(new Set(s.layers.map(l=>l.name)).size!==s.layers.length)fail('Duplicate source terrain layer');
 const decode=(value:string)=>{try{return unpackSourceBytes(value);}catch{return new Uint8Array();}};
 const slots=decode(s.layerSlots);
 for(let i=0;i<slots.length;i++)if((slots[i]!==255&&slots[i]!>=s.layers.length)||(i%6===0&&slots[i]===255)){fail('Source subblock references an invalid terrain layer');break;}
 for(const group of s.grass){
  const raw=decode(group.instances);
  for(let i=0;i+7<raw.length;i+=8)if(raw[i]!>=s.blocks[0]||raw[i+1]!>=s.blocks[1]){fail('Source grass references an invalid block');break;}
 }
});
export type ImportedTerrain=z.infer<typeof importedTerrainSchema>;
export function unpackSourceBytes(text:string):Uint8Array {
 const raw=atob(text),out=new Uint8Array(raw.length);
 for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);
 return out;
}
const cache=new WeakMap<ImportedTerrain,SourceHeight>();
export function sourceHeight(source:ImportedTerrain):SourceHeight {
 let field=cache.get(source);if(!field){field=new SourceHeight(source);cache.set(source,field);}return field;
}
export class SourceHeight {
 readonly values:Uint16Array;
 constructor(readonly source:ImportedTerrain){
  const bytes=unpackSourceBytes(source.height),view=new DataView(bytes.buffer);
  this.values=new Uint16Array(bytes.length/2);
  for(let i=0;i<this.values.length;i++)this.values[i]=view.getUint16(i*2,true);
 }
 at(x:number,z:number):number {
  const [w,h]=this.source.heightSize;
  return this.values[Math.max(0,Math.min(h-1,z))*w+Math.max(0,Math.min(w-1,x))]!*64/65535+this.source.heightOffset;
 }
 /** TerrainCommon.fxh::GetTerrainNormal, including its 49-sample du constant. */
 normal(x:number,z:number):[number,number,number] {
  const a=this.sample(x-1/6,z-1/6),b=this.sample(x+1/6,z-1/6),c=this.sample(x-1/6,z+1/6);
  const nx=(a-b)/(8/49),nz=(a-c)/(8/49),length=Math.hypot(nx,2,nz);
  return [nx/length,2/length,nz/length];
 }
 sample(x:number,z:number):number {
  const [ox,oz]=this.source.origin,[w,h]=this.source.heightSize;
  const fx=Math.max(0,Math.min(w-1,(x-ox)*3)),fz=Math.max(0,Math.min(h-1,(z-oz)*3));
  const ix=Math.floor(fx),iz=Math.floor(fz),tx=fx-ix,tz=fz-iz;
  return (this.at(ix,iz)*(1-tx)+this.at(ix+1,iz)*tx)*(1-tz)+(this.at(ix,iz+1)*(1-tx)+this.at(ix+1,iz+1)*tx)*tz;
 }
}
