import {z} from 'zod';
const abilityId=z.string().regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/).max(160);
const colour=z.string().regex(/^#[a-fA-F0-9]{6}$/);
const pulseSchema=z.object({periodTicks:z.number().int().min(1).max(2400),min:z.number().min(0).max(4),max:z.number().min(0).max(4),easing:z.enum(['sine','smoothstep','bounce']),phase:z.number().min(0).max(1).optional()}).strict().refine(p=>p.max>=p.min,'Pulse maximum must be at least its minimum');
export const cueMotionSchema=z.object({
 rotation:z.object({periodTicks:z.number().int().min(1).max(2400),direction:z.enum(['clockwise','counterclockwise']),phaseDegrees:z.number().min(-360).max(360).optional()}).strict().optional(),
 scale:pulseSchema.optional(),opacity:pulseSchema.refine(p=>p.max<=1,'Opacity cannot exceed one').optional(),
}).strict();

export const visualLayerSchema=z.object({
 id:z.string().min(1).max(64),name:z.string().max(100).optional(),sustain:z.boolean().default(false),enabled:z.boolean().default(true),startTick:z.number().int().min(0).max(12000).default(0),
 emitter:z.object({mode:z.enum(['burst','continuous']),lifetimeTicks:z.number().int().min(1).max(400),rate:z.number().min(1).max(240),speed:z.number().min(0).max(40),speedVariation:z.number().min(0).max(1),direction:z.object({x:z.number().min(-1).max(1),y:z.number().min(-1).max(1),z:z.number().min(-1).max(1)}).strict(),coneDegrees:z.number().min(0).max(180),gravity:z.number().min(-40).max(40),drag:z.number().min(0).max(10),spawnRadius:z.number().min(0).max(20),startSize:z.number().min(.01).max(20),endSize:z.number().min(0).max(20),spin:z.number().min(-30).max(30),fadeIn:z.number().min(0).max(1),fadeOut:z.number().min(0).max(1)}).strict().optional(),
 offset:z.object({x:z.number().min(-100).max(100),y:z.number().min(-100).max(100),z:z.number().min(-100).max(100)}).strict().optional(),
  anchor:z.enum(['source','target']).default('target'),shape:z.enum(['ring','pillar','burst','billboard','streaks','glow','light','rain','missile','beam','wavefront','particles']),
  colour,accent:colour,durationTicks:z.number().int().min(1).max(400),count:z.number().int().min(1).max(128),
  size:z.number().min(.01).max(20),height:z.number().min(0).max(30),
  motion:cueMotionSchema.optional(),
  distribution:z.enum(['point','disc']).optional(),
  fallSpeed:z.number().min(.25).max(8).optional(),launchDelayMs:z.number().min(0).max(500).optional(),fallAngleDegrees:z.number().min(0).max(70).optional(),fallAzimuthDegrees:z.number().min(-360).max(360).optional(),
  impact:z.object({durationTicks:z.number().int().min(1).max(80),count:z.number().int().min(1).max(12),size:z.number().min(.01).max(2),spread:z.number().min(0).max(5),height:z.number().min(0).max(5),colour,accent:colour}).strict().optional(),
  blend:z.enum(['additive','normal']).optional(),orientation:z.enum(['camera','ground']).optional(),
  follow:z.boolean().optional(),intensity:z.number().min(0).max(500).optional(),spread:z.number().min(0).max(20).optional(),length:z.number().min(.01).max(20).optional(),
  texture:z.object({asset:abilityId,role:z.literal('image'),index:z.number().int().min(1).max(32)}).strict().optional(),

}).strict().refine(c=>(c.shape==='particles')===!!c.emitter,'Particle layers require emitter settings; other shapes do not').refine(c=>!c.motion||['ring','glow','billboard','light'].includes(c.shape),'Transform motion requires a layer shape').refine(c=>c.shape==='rain'||[c.fallSpeed,c.launchDelayMs,c.fallAngleDegrees,c.fallAzimuthDegrees,c.impact].every(v=>v===undefined),'Fall and impact settings require rain').refine(c=>!c.texture||['burst','billboard','streaks','rain','missile','wavefront','particles'].includes(c.shape),'This layer does not accept textures').refine(c=>!['billboard','streaks','rain'].includes(c.shape)||!!c.texture,'This layer requires a texture');
export const visualEffectSchema=z.object({schemaVersion:z.literal(1),id:abilityId.refine(id=>id.startsWith('effect.'),'Effect IDs must start with effect.'),name:z.string().trim().min(1).max(100),description:z.string().max(2000).default(''),durationTicks:z.number().int().min(1).max(12000),loop:z.boolean().default(false),layers:z.array(visualLayerSchema).max(32)}).strict().refine(e=>new Set(e.layers.map(l=>l.id)).size===e.layers.length,'Layer IDs must be unique');
export const effectLibrarySchema=z.object({schemaVersion:z.literal(1),effects:z.array(visualEffectSchema).max(10000)}).strict().refine(l=>new Set(l.effects.map(e=>e.id)).size===l.effects.length,'Duplicate effect ID');
export type VisualLayer=z.infer<typeof visualLayerSchema>;
export type VisualEffect=z.infer<typeof visualEffectSchema>;
export const effectBindingSchema=z.object({id:z.string().min(1).max(64),effect:abilityId,event:z.enum(['accepted','released','healed','damaged','cancelled','waveStarted','wave','finished','projectile','impact','statusApplied','dispelled','summoned']),anchor:z.enum(['caster','target']),lifetime:z.enum(['finite','status']).default('finite'),durationFrom:z.literal('delivery').optional(),sizeFrom:z.literal('radius').optional(),spreadFrom:z.literal('radius').optional()}).strict().refine(b=>b.lifetime!=='status'||b.event==='statusApplied'&&b.anchor==='target','Status lifetime requires target statusApplied binding');
export type EffectBinding=z.infer<typeof effectBindingSchema>;
/** Resolved render recipe, never persisted inside a spell. */
export type EffectRecipe=Omit<VisualLayer,'anchor'> & Omit<EffectBinding,'id'|'effect'> & {id:string; loop?:boolean;periodTicks?:number};
export function resolveEffectBindings(bindings:EffectBinding[],effects:readonly VisualEffect[]):EffectRecipe[]{return bindings.flatMap(b=>{const effect=effects.find(e=>e.id===b.effect);if(!effect)throw Error('Unknown visual effect '+b.effect);return effect.layers.filter(l=>l.enabled).map(l=>({...l,...b,id:b.id+'/'+l.id,anchor:l.anchor==='source'?'caster':b.anchor,loop:effect.loop,periodTicks:effect.durationTicks}));});}
