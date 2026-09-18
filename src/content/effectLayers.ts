import {z} from 'zod';
const color=z.string().regex(/^#[0-9a-fA-F]{6}$/);
/** Presentation only. Limits are per declaration; renderer enforces a global budget too. */
export const effectLayerSchema=z.object({
 id:z.string().min(1).max(64),enabled:z.boolean().default(true),
 phase:z.enum(['cast','impact']).default('impact'),
 kind:z.enum(['ring','disc','sphere','particles']),
 texture:z.enum(['none','soft','rune','cracks','spark']).default('none'),
 motion:z.enum(['burst','rise','fall','orbit']).default('burst'),
 anchor:z.enum(['target','origin']).default('target'),
 delay:z.number().int().min(0).max(200).default(0),
 duration:z.number().int().min(1).max(200).default(40),
 repeat:z.number().int().min(1).max(12).default(1),
 color,endColor:color,
 opacity:z.number().min(0).max(1).default(.6),
 fadeIn:z.number().min(0).max(.5).default(.08),
 fadeOut:z.number().min(.01).max(1).default(.65),
 size:z.number().min(.01).max(4).default(.3),
 endSize:z.number().min(.01).max(4).default(1),
 spread:z.number().min(0).max(3).default(1),
 height:z.number().min(0).max(20).default(2),
 rotation:z.number().min(-360).max(360).default(0),
 spin:z.number().min(-720).max(720).default(0),
 count:z.number().int().min(1).max(128).default(24),
 blending:z.enum(['normal','additive']).default('additive'),
}).strict();
export type EffectLayer=z.infer<typeof effectLayerSchema>;
export const EFFECT_BUDGET={cues:32,layers:64,particles:2048} as const;
export function layerLife(layer:EffectLayer,age:number):{t:number;alpha:number}|null {
 const elapsed=age-layer.delay;if(!layer.enabled||elapsed<0||elapsed>=layer.duration)return null;
 const t=(elapsed/layer.duration*layer.repeat)%1;
 const alpha=Math.min(1,layer.fadeIn?t/layer.fadeIn:1,(1-t)/layer.fadeOut)*layer.opacity;
 return {t,alpha};
}
const layer=(id:string,kind:EffectLayer['kind'],extras:Partial<EffectLayer>={})=>effectLayerSchema.parse({id,kind,color:'#edb760',endColor:'#835330',...extras});
/** Presets edit visuals, never silently add damage, channels or slowing mechanics. */
export const EFFECT_PRESETS:Record<string,readonly EffectLayer[]>={
 'Earthquake':[
  layer('warning','ring',{phase:'cast',color:'#ffbd61',endColor:'#ffeab2',duration:40,size:.9,endSize:1,opacity:.4}),
  layer('fractures','disc',{texture:'cracks',color:'#d99442',endColor:'#443024',size:1,endSize:1.08,duration:64,blending:'normal',opacity:.85}),
  layer('shockwave','ring',{size:.15,endSize:1.4,duration:22,opacity:.8}),
  layer('debris','particles',{motion:'burst',count:40,size:.18,endSize:.06,height:3,spread:1,duration:40,blending:'normal'}),
  layer('dust','particles',{texture:'soft',motion:'rise',count:18,color:'#bba280',endColor:'#756c5c',size:.45,endSize:1.1,height:1.7,duration:64,opacity:.25,blending:'normal'}),
 ],
 'Ice storm':[
  layer('frost','disc',{texture:'rune',color:'#68b9e4',endColor:'#b4e5fa',size:1,endSize:1,duration:120,opacity:.35,spin:18}),
  layer('shards','particles',{motion:'fall',count:64,color:'#addef7',endColor:'#f0fbff',size:.16,endSize:.10,height:9,duration:120,repeat:4,spread:1,opacity:.9}),
  layer('mist','particles',{texture:'soft',motion:'orbit',count:16,color:'#85b8cc',endColor:'#c3e7f2',size:.6,endSize:.8,height:.35,duration:120,repeat:2,opacity:.22,blending:'normal'}),
 ],
 'Guardian aura':[
  layer('inscription','disc',{texture:'rune',color:'#63bfc3',endColor:'#d8faf0',size:.9,endSize:1,duration:120,spin:40,repeat:3,opacity:.45}),
  layer('orbit','particles',{texture:'spark',motion:'orbit',color:'#81d5ba',endColor:'#f2ffd0',count:24,size:.15,endSize:.10,height:1.7,duration:120,repeat:2,spin:90,opacity:.7}),
  layer('ward','sphere',{color:'#66a5bd',endColor:'#b7e4db',size:.95,endSize:1,height:1.3,duration:120,opacity:.13,blending:'normal'}),
 ],
 'Heavy impact':[
  layer('contact','disc',{texture:'spark',color:'#fff1c0',endColor:'#ed9b3d',size:.3,endSize:.02,duration:8,opacity:.85}),
  layer('wave','ring',{size:.12,endSize:1.2,duration:22,opacity:.7}),
  layer('chips','particles',{count:24,size:.16,endSize:.05,height:2.5,duration:32,blending:'normal'}),
 ],
};
