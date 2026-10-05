import {z} from 'zod';
export const releaseVersion=z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/,'Use a stable major.minor.patch version');
export const changeKinds=['added','improved','fixed','knownIssues'] as const;
export const releaseImage=z.object({file:z.string().regex(/^[a-f0-9]{64}\.webp$/),alt:z.string().trim().min(1).max(240),caption:z.string().trim().max(400).optional(),width:z.number().int().positive().max(1600),height:z.number().int().positive().max(1600)}).strict();
export type ReleaseImage=z.infer<typeof releaseImage>;
export const changeSet=z.object({images:z.array(releaseImage).max(8).refine(images=>new Set(images.map(i=>i.file)).size===images.length,'Duplicate gallery image').optional(),added:z.array(z.string().trim().min(1).max(1000)).max(200),improved:z.array(z.string().trim().min(1).max(1000)).max(200),fixed:z.array(z.string().trim().min(1).max(1000)).max(200),knownIssues:z.array(z.string().trim().min(1).max(1000)).max(200)}).strict();
export const releaseEntry=changeSet.extend({version:releaseVersion,publishedAt:z.iso.datetime(),title:z.string().trim().min(1).max(120)}).strict();
export const releaseLog=z.object({schemaVersion:z.literal(1),unreleased:changeSet,releases:z.array(releaseEntry).max(10000)}).strict().superRefine((log,c)=>{if(new Set(log.releases.map(r=>r.version)).size!==log.releases.length)c.addIssue({code:'custom',path:['releases'],message:'Duplicate release version'});});
export type ReleaseEntry=z.infer<typeof releaseEntry>;
export const emptyChanges=()=>({added:[],improved:[],fixed:[],knownIssues:[]});
export function compareVersions(a:string,b:string):number {releaseVersion.parse(a);releaseVersion.parse(b);const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i]?1:-1;return 0;}
export function releaseNotes(entry:ReleaseEntry):string {return [entry.title,...changeKinds.flatMap(kind=>entry[kind].length?['',({added:'Added',improved:'Improved',fixed:'Fixed',knownIssues:'Known issues'})[kind],...entry[kind].map(s=>`- ${s}`)]:[])].join('\n');}
