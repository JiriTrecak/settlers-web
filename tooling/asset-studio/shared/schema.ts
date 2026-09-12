/** Shared authoring contracts. The UI and local service validate the same requests. */
import {z} from 'zod';
import {imageProfiles} from './profiles';
import {assetSchema} from '../../../src/content/schema';
import {parseCatalogue, type CatalogEntry} from '../../../src/shared/asset/catalog';
export const safePath=z.string().regex(/^[a-zA-Z0-9_./-]+$/).refine(p=>!p.startsWith('/')&&!p.split('/').includes('..'));
export const outputSchema=z.object({role:z.string(),path:safePath,sha256:z.string().length(64),bytes:z.number().nonnegative(),width:z.number().optional(),height:z.number().optional(),triangles:z.number().optional(),primitives:z.number().optional()}).strict();
const scenerySchema=z.custom<CatalogEntry>(v=>!!parseCatalogue({v:1,name:'validation',assets:[v]}));
export const recordSchema=z.object({
 version:z.literal(1),id:z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/),name:z.string().min(1),kind:z.enum(['icon','interface','model','texture','audio','map','data']),
 faction:z.string().optional(),tags:z.array(z.string()),status:z.enum(['published','archived']),revision:z.number().int().positive(),profile:z.string(),
 outputs:z.array(outputSchema).min(1),render:z.array(assetSchema),scenery:z.array(scenerySchema),
 source:z.object({path:z.string(),sha256:z.string().length(64),quality:z.enum(['master','runtime-only','shared'])}),
 origin:z.object({method:z.enum(['migration','import','openai']),previousPath:z.string().optional(),job:z.string().optional()}),
 validation:z.object({checkedAt:z.string(),warnings:z.array(z.string())}),
}).strict();
export type AssetRecord=z.infer<typeof recordSchema>;
export type RuntimeRecord=Pick<AssetRecord,'id'|'name'|'kind'|'faction'|'tags'|'revision'|'profile'|'outputs'|'render'|'scenery'>;
export type Manifest={version:1;records:RuntimeRecord[]};
export const generationSchema=z.object({model:z.enum(['gpt-image-2','gpt-image-2-2026-04-21']).default('gpt-image-2'),size:z.string().default('1024x1024'),quality:z.enum(['auto','low','medium','high']).default('high'),background:z.enum(['transparent','opaque','auto']).default('opaque'),output_format:z.enum(['png','jpeg','webp']).default('png'),output_compression:z.number().int().min(0).max(100).optional(),n:z.number().int().min(1).max(10).default(1),moderation:z.enum(['auto','low']).default('auto'),stream:z.boolean().default(false),partial_images:z.number().int().min(0).max(3).default(0)}).strict().superRefine((v,ctx)=>{
 if(v.size!=='auto'){const m=/^(\d+)x(\d+)$/.exec(v.size);const w=Number(m?.[1]),h=Number(m?.[2]);if(!m||w%16||h%16||Math.max(w,h)>3840||Math.max(w,h)/Math.min(w,h)>3||w*h<655360||w*h>8294400)ctx.addIssue({code:'custom',message:'Invalid GPT Image 2 dimensions (16px steps, 0.66–8.29MP, max edge 3840, max ratio 3:1).'});}
 if(v.background==='transparent'&&v.output_format==='jpeg')ctx.addIssue({code:'custom',message:'Transparent output requires PNG or WebP.'});
 if(v.output_compression!==undefined&&v.output_format==='png')ctx.addIssue({code:'custom',message:'PNG does not accept output_compression.'});
 if(!v.stream&&v.partial_images)ctx.addIssue({code:'custom',message:'Partial previews require streaming.'});
});
export const transformSchema=z.object({fit:z.enum(['contain','cover']).default('contain'),background:z.string().regex(/^#[a-fA-F0-9]{6}(?:[a-fA-F0-9]{2})?$/).default('#00000000'),crop:z.object({left:z.number().int().nonnegative(),top:z.number().int().nonnegative(),width:z.number().int().positive(),height:z.number().int().positive()}).optional()}).strict();
export const jobRequestSchema=z.object({
 submissionId:z.string().uuid(),name:z.string().min(1).max(100),slug:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
 category:z.enum(['item','command','unit-ants','building-ants','resource','stat','ability-ants','research-ants','interface']),
 profile:z.enum(['icon','interface-rim','interface-fill','interface-image']).default('icon'),
 width:z.number().int().min(16).max(4096).default(128),height:z.number().int().min(16).max(4096).default(128),
 opening:z.object({x:z.number().min(0).max(1),y:z.number().min(0).max(1),width:z.number().positive().max(1),height:z.number().positive().max(1)}).optional(),
 style:z.string().default('painted-items'),prompt:z.string().min(1).max(24000),
 references:z.array(z.object({id:z.string(),role:z.enum(['style','subject','layout'])})).max(16).default([]),
 replaceId:z.string().optional(),expectedRevision:z.number().int().positive().optional(),
 parameters:generationSchema,transform:transformSchema.default({fit:'contain',background:'#00000000'}),
}).strict().superRefine((v,c)=>{if(v.profile==='icon'&&(v.width!==imageProfiles.icon.width||v.height!==imageProfiles.icon.height))c.addIssue({code:'custom',message:'Icons publish at exactly 128 × 128.'});if(v.profile==='interface-rim'&&!v.opening)c.addIssue({code:'custom',message:'Rims require a transparent opening rectangle.'});if(v.opening&&(v.opening.x+v.opening.width>1||v.opening.y+v.opening.height>1))c.addIssue({code:'custom',message:'Opening extends outside image.'});});
export type JobRequest=z.infer<typeof jobRequestSchema>;
export type Candidate={id:string;source:string;sourceHash:string;output?:string;outputHash?:string;approval?:string;errors:string[];warnings:string[];width?:number;height?:number;bytes?:number;alpha?:{transparent:number;partial:number;opaque:number}};
export type Job={version:1;method?:'import'|'openai';id:string;createdAt:string;updatedAt:string;state:'draft'|'queued'|'generating'|'ready'|'failed'|'unknown'|'canceled'|'published';request:JobRequest;prompt:string;references:{id:string;role:string;revision:number;sha256:string;path:string}[];candidates:Candidate[];mask?:{path:string;sha256:string};error?:string;requestId?:string;usage?:unknown;publishedId?:string};
export type Style={id:string;name:string;description:string;references:string[]};
