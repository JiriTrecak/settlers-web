import {z} from 'zod';
import {assetSchema as runtimeRenderSchema} from '../../content/schema';
import {authoringId,landscapeRecipeSchema,waterProfileSchema} from './recipes';

export const ASSET_KINDS=['unit','creature','building','tree','foliage','prop','bridge','terrain-material','water-profile','landscape-recipe','icon','interface','texture','audio','map','data'] as const;
export const FILE_ROLES=['geometry','source','image','albedo','normal','roughness','metalness','occlusion','height','opacity','team_mask','emissive','wind','animation','collision','walkable','preview','reference','data','grading','audio','generation'] as const;
export type FileRole=typeof FILE_ROLES[number];
/** One physical filename grammar, shared by the server, compiler, MCP and UI. */
export const ROLE_FORMATS:Readonly<Record<FileRole,readonly string[]>>={
 geometry:['glb'],source:['blend','glb','gltf','png','jpeg','webp','svg','json','bin','wav','ogg','mp3'],
 image:['png','jpeg','webp','svg'],albedo:['png','jpeg','webp'],normal:['png'],roughness:['png'],metalness:['png'],occlusion:['png','bin'],height:['png','bin'],opacity:['png'],team_mask:['png'],emissive:['png','jpeg','webp'],wind:['png','bin'],
 animation:['glb'],collision:['glb'],walkable:['glb'],preview:['png','jpeg','webp'],reference:['png','jpeg','webp'],data:['json','bin','utcmap','lua'],grading:['png','bin','json'],generation:['json'],audio:['wav','ogg','mp3'],
};
const refSchema=z.object({role:z.enum(FILE_ROLES),index:z.number().int().min(1).max(1024)}).strict();
export type ResourceRef=z.infer<typeof refSchema>;
const finite=z.number().finite();
const vector=z.tuple([finite,finite,finite]);
const resourceSchema=refSchema.extend({format:z.string(),sha256:z.string().regex(/^[a-f0-9]{64}$/),bytes:z.number().int().nonnegative(),colorSpace:z.enum(['srgb','linear','none']).optional()}).strict().superRefine((r,c)=>{
 if(!ROLE_FORMATS[r.role].includes(r.format))c.addIssue({code:'custom',path:['format'],message:`Unsupported ${r.role} format`});
});
export type AssetResource=z.infer<typeof resourceSchema>;
export function resourceFilename(ref:ResourceRef&{format:string}):string{
 refSchema.parse({role:ref.role,index:ref.index});
 if(!ROLE_FORMATS[ref.role].includes(ref.format))throw Error(`Unsupported ${ref.role} format: ${ref.format}`);
 return `${ref.role}${ref.index===1?'':'_'+ref.index}.${ref.format}`;
}
export function assetFolder(id:string):string{return `art/assets/${authoringId.parse(id)}`;}
const textureRoles=new Set<FileRole>(['image','albedo','normal','roughness','metalness','occlusion','height','opacity','team_mask','emissive','wind','grading']);
const materialSchema=z.object({
 slot:z.string().min(1).max(160),shader:z.enum(['standard','foliage','grass','terrain','water','source-reference']),
 color:z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ffffff'),roughness:finite.min(0).max(1).default(1),metalness:finite.min(0).max(1).default(0),
 alphaMode:z.enum(['opaque','cutout','blend']).default('opaque'),alphaCutoff:finite.min(0).max(1).default(.4),doubleSided:z.boolean().default(false),
 textures:z.partialRecord(z.enum(['albedo','normal','roughness','metalness','occlusion','height','opacity','teamMask','emissive','wind']),refSchema).default({}),
}).strict();
const attachment=z.object({name:authoringId,node:z.string().min(1).max(160),offset:vector.default([0,0,0])}).strict();
const linkedResource=refSchema.extend({asset:authoringId}).strict();
const renderBinding=runtimeRenderSchema.omit({file:true,image:true,harvestAnimation:true}).extend({geometry:linkedResource.optional(),image:linkedResource.optional(),harvestAnimation:linkedResource.optional()}).strict();
const blocker=z.object({width:finite.positive(),depth:finite.positive(),shape:z.literal('ellipse').optional(),x:finite.optional(),z:finite.optional(),yaw:finite.optional()}).strict();
const sceneryBinding=z.object({
 id:authoringId,name:z.string().min(1),editorHidden:z.boolean().optional(),category:z.enum(['units','foliage','terrain','water','landmark','resource','other']),type:z.enum(['prop','water','span','ground']),geometry:refSchema,
 blocker:blocker.optional(),blockers:z.array(blocker).max(128).optional(),
 deck:z.object({width:finite.positive(),depth:finite.positive(),height:finite,arch:finite.nonnegative(),thickness:finite.positive().max(12).optional(),rise:finite.min(-32).max(32).optional(),level:z.number().int().min(1).max(31),connections:z.object({start:z.number().int().min(0).max(31).optional(),end:z.number().int().min(0).max(31).optional()}).strict().optional()}).strict().optional(),
 light:z.object({x:finite,y:finite,z:finite,color:z.string().regex(/^#[0-9a-fA-F]{6}$/),intensity:finite.nonnegative(),range:finite.positive()}).strict().optional(),
}).strict();
export const assetDefinitionSchema=z.object({
 version:z.literal(1),id:authoringId,name:z.string().trim().min(1).max(160),kind:z.enum(ASSET_KINDS),
 revision:z.number().int().positive(),status:z.enum(['draft','published','archived']),tags:z.array(z.string().min(1).max(80)).max(64).default([]),
 resources:z.array(resourceSchema).max(2048),usesGeometry:z.boolean(),
 transform:z.object({scale:finite.positive().max(10000),pivot:vector,up:z.literal('Y'),forward:z.enum(['+Z','-Z'])}).strict().default({scale:1,pivot:[0,0,0],up:'Y',forward:'+Z'}),
 materials:z.array(materialSchema).max(128).default([]),
 bindings:z.object({faction:authoringId.optional(),profile:authoringId.optional(),render:z.array(renderBinding).max(256).default([]),scenery:z.array(sceneryBinding).max(256).default([])}).strict().default({render:[],scenery:[]}),
 capabilities:z.object({
  wind:z.object({mode:z.enum(['tree','foliage','grass']),strength:finite.min(0).max(4),speed:finite.min(0).max(10),stiffness:finite.min(0).max(1)}).strict().optional(),
  teamColor:z.object({mode:z.enum(['material','mask']),slots:z.array(z.string().min(1)).min(1).max(128),mask:refSchema.optional()}).strict().optional(),
  animations:z.array(z.object({semantic:authoringId,clip:z.string().min(1),loop:z.boolean(),nominalSpeed:finite.nonnegative().optional(),events:z.array(z.object({name:authoringId,time:finite.nonnegative()}).strict()).max(128).default([])}).strict()).max(128).optional(),
  sockets:z.array(attachment).max(128).optional(),
  blocker:z.object({shape:z.enum(['box','ellipse']),size:z.tuple([finite.positive(),finite.positive()]),offset:z.tuple([finite,finite]).default([0,0])}).strict().optional(),
  vegetationClearance:finite.min(0).max(128).optional(),
  groundContact:z.object({mode:z.enum(['pivot','terrain','water','free']),underlay:refSchema.optional(),ambientRadius:finite.min(0).max(128).optional()}).strict().optional(),
  walkable:z.object({surface:refSchema,connectors:z.array(z.object({name:authoringId,position:vector,width:finite.positive()}).strict()).min(2).max(16)}).strict().optional(),
  harvesting:z.object({replacement:authoringId,definition:authoringId.optional()}).strict().optional(),
 }).strict().default({}),
 water:waterProfileSchema.optional(),recipe:landscapeRecipeSchema.optional(),
 provenance:z.object({method:z.enum(['import','migration','generated','authored']),licenseNote:z.string().max(4000).optional(),sourceHash:z.string().regex(/^[a-f0-9]{64}$/).optional(),generation:refSchema.optional()}).strict(),
}).strict().superRefine((asset,ctx)=>{
 const keys=new Set<string>(),roles=new Map<string,number[]>();
 for(const [i,r]of asset.resources.entries()){
  const key=`${r.role}:${r.index}`;
  if(keys.has(key))ctx.addIssue({code:'custom',path:['resources',i],message:'Duplicate resource role/index'});
  keys.add(key);roles.set(r.role,[...(roles.get(r.role)??[]),r.index]);
 }
 for(const [role,indices]of roles)if(indices.sort((a,b)=>a-b).some((n,i)=>n!==i+1))ctx.addIssue({code:'custom',path:['resources'],message:`${role} sequence must start at 1 without gaps`});
 if(asset.usesGeometry!==roles.has('geometry'))ctx.addIssue({code:'custom',path:['usesGeometry'],message:'usesGeometry must match the geometry resources'});
 function check(ref:ResourceRef|undefined,path:(string|number)[],role?:FileRole){if(!ref)return;if(!keys.has(`${ref.role}:${ref.index}`))ctx.addIssue({code:'custom',path,message:'Resource is not declared'});if(role&&ref.role!==role)ctx.addIssue({code:'custom',path,message:`Expected ${role} resource`});}
 for(const [i,m]of asset.materials.entries())for(const [slot,ref]of Object.entries(m.textures)){check(ref,['materials',i,'textures',slot]);if(!textureRoles.has(ref.role))ctx.addIssue({code:'custom',path:['materials',i,'textures',slot],message:'Material texture must reference an image/data texture role'});}
 if(new Set(asset.materials.map(m=>m.slot)).size!==asset.materials.length)ctx.addIssue({code:'custom',path:['materials'],message:'Material slots must be unique'});
 for(const [i,s]of asset.bindings.scenery.entries())check(s.geometry,['bindings','scenery',i,'geometry'],'geometry');
 check(asset.provenance.generation,['provenance','generation'],'generation');
 const c=asset.capabilities;
 check(c.teamColor?.mask,['capabilities','teamColor','mask'],'team_mask');
 if(c.teamColor?.mode==='mask'&&!c.teamColor.mask)ctx.addIssue({code:'custom',path:['capabilities','teamColor'],message:'Mask team coloring requires a mask resource'});
 check(c.groundContact?.underlay,['capabilities','groundContact','underlay'],'geometry');
 check(c.walkable?.surface,['capabilities','walkable','surface'],'walkable');
 for(const [key,items] of [['sockets',c.sockets],['animations',c.animations]] as const){if(items){const names=items.map(i=>'name'in i?i.name:i.semantic);if(new Set(names).size!==names.length)ctx.addIssue({code:'custom',path:['capabilities',key],message:'Names must be unique'});}}
 if(asset.kind==='water-profile'&&!asset.water)ctx.addIssue({code:'custom',path:['water'],message:'Water profile parameters required'});
 if(asset.kind==='landscape-recipe'&&!asset.recipe)ctx.addIssue({code:'custom',path:['recipe'],message:'Landscape recipe required'});
 if(asset.water&&asset.kind!=='water-profile')ctx.addIssue({code:'custom',path:['water'],message:'Water parameters belong to a water-profile asset'});
 if(asset.recipe&&asset.kind!=='landscape-recipe')ctx.addIssue({code:'custom',path:['recipe'],message:'Recipe parameters belong to a landscape-recipe asset'});
 if(!asset.usesGeometry&&(c.wind||c.teamColor||c.animations||c.sockets||c.blocker||c.walkable||c.harvesting))ctx.addIssue({code:'custom',path:['capabilities'],message:'Model capabilities require geometry'});
 if(asset.status==='published'&&['unit','creature','building','tree','foliage','prop','bridge'].includes(asset.kind)&&!asset.usesGeometry)ctx.addIssue({code:'custom',path:['resources'],message:'Published model asset requires geometry'});
 if(asset.status==='published'&&['icon','interface'].includes(asset.kind)&&!roles.has('image'))ctx.addIssue({code:'custom',path:['resources'],message:'Published image asset requires image'});
});
export type AssetDefinition=z.infer<typeof assetDefinitionSchema>;
export function resolveResource(asset:AssetDefinition,ref:ResourceRef):string{
 const r=asset.resources.find(r=>r.role===ref.role&&r.index===ref.index);
 if(!r)throw Error(`Missing ${ref.role} ${ref.index} in ${asset.id}`);
 return `${assetFolder(asset.id)}/${resourceFilename(r)}`;
}
