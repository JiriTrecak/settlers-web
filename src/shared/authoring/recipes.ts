import {z} from 'zod';

export const authoringId=z.string().min(1).max(160).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
const finite=z.number().finite();
const color=z.string().regex(/^#[0-9a-fA-F]{6}$/);
/** Appearance belongs to the reusable profile; course/elevation belong to map instances. */
export const waterProfileSchema=z.object({
 shallowColor:color,deepColor:color,clarity:finite.min(.2).max(12),
 rippleScale:finite.min(.01).max(1),rippleStrength:finite.min(0).max(.5),
 foamStrength:finite.min(0).max(1),reflectionStrength:finite.min(0).max(1),
 causticStrength:finite.min(0).max(1),cloudStrength:finite.min(0).max(.2),
 flowSpeed:finite.min(0).max(3),
}).strict();
const species=z.object({asset:authoringId,weight:finite.positive().max(10000)}).strict();
const scatter=z.object({
 density:finite.min(0).max(8).optional(),pattern:z.enum(['scattered','patches']).optional(),
 species:z.array(species).min(1).max(64),spacing:finite.min(.1).max(64),
 probability:finite.min(0).max(1),jitter:finite.min(0).max(1),
 scaleMin:finite.min(.01).max(20),scaleMax:finite.min(.01).max(20),
 maxSlope:finite.min(0).max(10),waterClearance:finite.min(0).max(64),
 objectClearance:finite.min(0).max(64),edgeFade:finite.min(0).max(64),
 minSpacing:finite.min(.1).max(64).optional(),
 riverBank:z.object({min:finite.min(0).max(128),max:finite.positive().max(256)}).strict().optional(),
 patchiness:z.object({scale:finite.min(.5).max(128),strength:finite.min(0).max(1)}).strict().optional(),
}).strict();
const recipeVariants=[
 z.object({type:z.literal('terrain'),operation:z.enum(['raise','lower','flatten']),height:finite.min(-128).max(128),falloff:finite.min(0).max(128)}).strict(),
 z.object({type:z.literal('river'),water:authoringId,width:finite.min(.2).max(128),depth:finite.min(.1).max(64),bankWidth:finite.min(.1).max(64),bankMaterial:authoringId.optional(),bedMaterial:authoringId.optional(),flow:finite.min(0).max(3),maxUphillGrade:finite.min(0).max(.05)}).strict(),
 z.object({type:z.literal('path'),material:authoringId,width:finite.min(.2).max(128),shoulder:finite.min(0).max(64),flatten:finite.min(0).max(1),vegetationClearance:finite.min(0).max(32)}).strict(),
 z.object({type:z.literal('forest'),...scatter.shape,interiorMargin:finite.min(0).max(64).default(0),edge:scatter.extend({width:finite.positive().max(64)}).strict().optional()}).strict(),
 z.object({type:z.literal('grass'),...scatter.shape}).strict(),
 z.object({type:z.literal('ground-cover'),...scatter.shape}).strict(),
] as const;
export const landscapeRecipeSchema=z.discriminatedUnion('type',recipeVariants).superRefine((r,c)=>{
 if('riverBank'in r&&r.riverBank&&r.riverBank.max<=r.riverBank.min)c.addIssue({code:'custom',message:'Riverbank maximum must exceed minimum',path:['riverBank']});
 if(r.type==='forest'&&r.edge){if(r.edge.scaleMax<r.edge.scaleMin)c.addIssue({code:'custom',message:'Edge maximum scale must exceed minimum scale',path:['edge','scaleMax']});if(r.edge.riverBank&&r.edge.riverBank.max<=r.edge.riverBank.min)c.addIssue({code:'custom',message:'Edge bank interval is empty',path:['edge','riverBank']});}
 if('scaleMin' in r&&r.scaleMax<r.scaleMin)c.addIssue({code:'custom',message:'Maximum scale must be at least minimum scale',path:['scaleMax']});
 if('species' in r&&new Set(r.species.map(s=>s.asset)).size!==r.species.length)c.addIssue({code:'custom',message:'Species must be unique',path:['species']});
});
export type LandscapeRecipe=z.infer<typeof landscapeRecipeSchema>;
export type WaterProfile=z.infer<typeof waterProfileSchema>;
/** Execution stages are an engine invariant, independent of the order authors draw layers. */
export const generationStage:Readonly<Record<LandscapeRecipe['type'],number>>={terrain:0,river:1,path:2,forest:4,grass:5,'ground-cover':6};
// Stage 3 is occupied by placed structures, whose footprints constrain vegetation.

/** Sparse instance inputs. Type prevents stale settings being applied to a different recipe kind. */
const scatterOverrides=scatter.partial().extend({
 patchiness:scatter.shape.patchiness.unwrap().partial().optional(),
 riverBank:scatter.shape.riverBank.unwrap().partial().optional(),
});
export const recipeOverridesSchema=z.discriminatedUnion('type',[
 recipeVariants[0].partial().extend({type:z.literal('terrain')}),
 recipeVariants[1].partial().extend({type:z.literal('river')}),
 recipeVariants[2].partial().extend({type:z.literal('path')}),
 scatterOverrides.extend({type:z.literal('forest'),interiorMargin:finite.min(0).max(64).optional(),edge:scatterOverrides.extend({width:finite.positive().max(64).optional()}).optional()}),
 scatterOverrides.extend({type:z.literal('grass')}),
 scatterOverrides.extend({type:z.literal('ground-cover')}),
]);
export type RecipeOverrides=z.infer<typeof recipeOverridesSchema>;
export function resolveRecipe(defaults:LandscapeRecipe,overrides?:RecipeOverrides):LandscapeRecipe{
 if(!overrides)return landscapeRecipeSchema.parse(defaults);
 const inputs=recipeOverridesSchema.parse(overrides);
 if(inputs.type!==defaults.type)throw Error(`Recipe inputs for ${inputs.type} cannot be used with ${defaults.type}`);
 function merge(base:Record<string,unknown>,patch:Record<string,unknown>):Record<string,unknown>{
  const result={...base};
  for(const [key,value] of Object.entries(patch)){
   if(value===undefined)continue;
   if(value!==null&&typeof value==='object'&&!Array.isArray(value)){
    const prior=result[key];
    result[key]=merge(prior&&typeof prior==='object'&&!Array.isArray(prior)?prior as Record<string,unknown>:key==='patchiness'?{scale:12,strength:.6}:{},value as Record<string,unknown>);
   }else result[key]=value;
  }
  return result;
 }
 return landscapeRecipeSchema.parse(merge(defaults,inputs));
}
