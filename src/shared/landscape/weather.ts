import {z} from 'zod';
export const weatherSchema=z.object({kind:z.enum(['clear','rain','snow','spores']),intensity:z.number().min(0).max(1),windX:z.number().min(-10).max(10),windZ:z.number().min(-10).max(10)}).strict();
export type WeatherSettings=z.infer<typeof weatherSchema>;
export const CLEAR_WEATHER:WeatherSettings={kind:'clear',intensity:0,windX:0,windZ:0};

/** Shared creation/editor presets; authors can fine-tune intensity and wind afterwards. */
export const WEATHER_CHOICES = [
 {kind:'clear',name:'Clear',intensity:0,windX:0,windZ:0},
 {kind:'rain',name:'Rain',intensity:.5,windX:1,windZ:.4},
 {kind:'snow',name:'Snow',intensity:.35,windX:.7,windZ:.25},
 {kind:'spores',name:'Drifting spores',intensity:.4,windX:.1,windZ:.05},
] as const;
export function weatherPreset(kind:WeatherSettings['kind']):WeatherSettings {
 const {name,...settings}=WEATHER_CHOICES.find(w=>w.kind===kind)!;return {...settings};
}
