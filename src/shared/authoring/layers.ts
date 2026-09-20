import {z} from 'zod';
import {authoringId,recipeOverridesSchema} from './recipes';
const coordinate=z.number().finite().min(-4096).max(4096);
const point=z.object({x:coordinate,z:coordinate}).strict();
export const splineKnotSchema=point.extend({
 elevation:z.number().finite().min(-128).max(128),
 incoming:point.optional(),outgoing:point.optional(),
 widthScale:z.number().finite().min(.05).max(8).default(1),
 depthScale:z.number().finite().min(.05).max(8).default(1),
 flowScale:z.number().finite().min(0).max(8).default(1),
}).strict();
export const layerShapeSchema=z.discriminatedUnion('type',[
 z.object({type:z.literal('region'),points:z.array(point).min(3).max(512)}).strict(),
 z.object({type:z.literal('spline'),knots:z.array(splineKnotSchema).min(2).max(128)}).strict(),
]);
export const proceduralLayerSchema=z.object({
 id:authoringId,name:z.string().trim().min(1).max(160),recipe:authoringId,
 overrides:recipeOverridesSchema.optional(),
 seed:z.number().int().min(0).max(0xffffffff),enabled:z.boolean().default(true),
 visible:z.boolean().default(true),locked:z.boolean().default(false),
 order:z.number().int().min(-100000).max(100000).default(0),shape:layerShapeSchema,
}).strict();
export const authoredObjectSchema=z.object({
 id:authoringId,asset:authoringId,x:coordinate,z:coordinate,
 elevation:z.number().finite().min(-128).max(128).default(0),
 yaw:z.number().finite().default(0),scale:z.number().finite().positive().max(100).default(1),
 heightMode:z.enum(['terrain','absolute']).default('terrain'),
 visible:z.boolean().default(true),locked:z.boolean().default(false),
 // Provenance is informational. A baked object no longer depends on its former layer.
 bakedFrom:authoringId.optional(),
}).strict();
export const authoringSceneSchema=z.object({
 version:z.literal(1),layers:z.array(proceduralLayerSchema).max(1024),objects:z.array(authoredObjectSchema).max(200000),
}).strict().superRefine((scene,c)=>{
 const ids=new Set<string>();for(const item of [...scene.layers,...scene.objects]){if(ids.has(item.id))c.addIssue({code:'custom',message:`Duplicate scene ID ${item.id}`});ids.add(item.id);}
});
export type LayerShape=z.infer<typeof layerShapeSchema>;
export type SplineKnot=z.infer<typeof splineKnotSchema>;
export type ProceduralLayer=z.infer<typeof proceduralLayerSchema>;
export type AuthoredObject=z.infer<typeof authoredObjectSchema>;
export type AuthoringScene=z.infer<typeof authoringSceneSchema>;
export type Bounds={minX:number;minZ:number;maxX:number;maxZ:number};
export function shapeBounds(shape:LayerShape,padding=0):Bounds{
 const points=shape.type==='region'?shape.points:shape.knots.flatMap(k=>[k,...(k.incoming?[k.incoming]:[]),...(k.outgoing?[k.outgoing]:[])]);
 return {minX:Math.min(...points.map(p=>p.x))-padding,minZ:Math.min(...points.map(p=>p.z))-padding,maxX:Math.max(...points.map(p=>p.x))+padding,maxZ:Math.max(...points.map(p=>p.z))+padding};
}
export function unionBounds(a:Bounds,b:Bounds):Bounds{return {minX:Math.min(a.minX,b.minX),minZ:Math.min(a.minZ,b.minZ),maxX:Math.max(a.maxX,b.maxX),maxZ:Math.max(a.maxZ,b.maxZ)};}
export function boundsOverlap(a:Bounds,b:Bounds):boolean{return a.minX<=b.maxX&&a.maxX>=b.minX&&a.minZ<=b.maxZ&&a.maxZ>=b.minZ;}
