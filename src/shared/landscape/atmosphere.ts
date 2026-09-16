import {z} from 'zod';
/** Map-authored appearance. GPU quality is a separate local player preference. */
export const mistRegionSchema=z.object({
 id:z.string().min(1).max(80),
 x:z.number().min(-1024).max(4096),y:z.number().min(-64).max(128),z:z.number().min(-1024).max(4096),
 radiusX:z.number().min(1).max(128),radiusY:z.number().min(.5).max(32),radiusZ:z.number().min(1).max(128),
 density:z.number().min(0).max(.2),
}).strict();
export const atmosphereSchema=z.object({
 enabled:z.boolean(),color:z.string().regex(/^#[0-9a-fA-F]{6}$/),
 sunTint:z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
 density:z.number().min(0).max(.08),baseHeight:z.number().min(-32).max(64),heightFalloff:z.number().min(.5).max(24),
 sunStrength:z.number().min(0).max(3),noiseScale:z.number().min(.01).max(.5),noiseStrength:z.number().min(0).max(1),
 driftSpeed:z.number().min(0).max(3),
 regions:z.array(mistRegionSchema).max(16).refine(r=>new Set(r.map(x=>x.id)).size===r.length,'Mist region IDs must be unique'),
}).strict();
export type AtmosphereSettings=z.infer<typeof atmosphereSchema>;
export type MistRegion=z.infer<typeof mistRegionSchema>;
/** Warm scattered sunlight; separate from the cool ambient mist color. */
export const DEFAULT_SHAFT_TINT='#ffe3b8';
export const DEFAULT_ATMOSPHERE:AtmosphereSettings={enabled:false,color:'#a8bdc6',density:.009,baseHeight:1,heightFalloff:4,sunStrength:1,noiseScale:.09,noiseStrength:.65,driftSpeed:.35,regions:[]};
export const PROLOGUE_ATMOSPHERE:AtmosphereSettings={...DEFAULT_ATMOSPHERE,enabled:true,density:.0048,heightFalloff:12,sunStrength:2.7,regions:[
 {id:'gate-mist',x:202,y:3,z:203,radiusX:14,radiusY:4,radiusZ:15,density:.006},
 {id:'old-crossing',x:111,y:1,z:121,radiusX:19,radiusY:4,radiusZ:15,density:.006},
 {id:'moss-shrine',x:104,y:2,z:163,radiusX:14,radiusY:3,radiusZ:12,density:.006},
 {id:'lakeside-den',x:205,y:1,z:104,radiusX:24,radiusY:4,radiusZ:27,density:.006},
]};
