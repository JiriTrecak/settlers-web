import {z} from 'zod';
export const encounterSettingsSchema=z.object({
 combat:z.boolean().default(false),
 initialStatuses:z.array(z.string()).max(8).default([]),
 targetCount:z.number().int().min(0).max(8).default(1),targetSpacing:z.number().min(1).max(8).default(2.5),
 relationship:z.enum(['ally','enemy','self','neutral']).default('ally'),distance:z.number().min(1).max(30).default(6),
 targetHealth:z.number().int().min(1).max(5000).default(40),mana:z.number().int().min(0).max(1000).default(200),
 casterDefinition:z.string().default('unit.ants.warrior'),targetDefinition:z.string().default('unit.ants.warrior'),
 biome:z.string().default('vibrant-forest'),seed:z.number().int().min(1).max(0xffffffff).default(42),
}).strict();
export type EncounterSettings=z.infer<typeof encounterSettingsSchema>;

/** Scene presets are independent of the selected ability. */
export const encounterPresets=[
 {id:'enemy-single',name:'Single ant (enemy)',settings:{relationship:'enemy',targetCount:1,targetDefinition:'unit.ants.warrior',targetHealth:500}},
 {id:'enemy-group',name:'Few ants (enemies)',settings:{relationship:'enemy',targetCount:5,targetDefinition:'unit.ants.warrior',targetHealth:500}},
 {id:'ally-single',name:'Single ant (ally)',settings:{relationship:'ally',targetCount:1,targetDefinition:'unit.ants.warrior',targetHealth:250}},
 {id:'ally-group',name:'Few ants (ally)',settings:{relationship:'ally',targetCount:5,targetDefinition:'unit.ants.warrior',targetHealth:250}},
 {id:'neutral-camp',name:'Neutral camp',settings:{relationship:'neutral',targetCount:5,targetDefinition:'unit.neutral.barkguard',targetHealth:500}},
 {id:'empty',name:'Empty ground',settings:{relationship:'enemy',targetCount:0,targetDefinition:'unit.ants.warrior',targetHealth:500}},
 {id:'self',name:'Caster only',settings:{relationship:'self',targetCount:0,targetDefinition:'unit.ants.warrior',targetHealth:500}},
] as const;
export function applyEncounterPreset(settings:EncounterSettings,id:string):EncounterSettings{
 const preset=encounterPresets.find(p=>p.id===id);if(!preset)throw Error('Unknown encounter setup '+id);
 return encounterSettingsSchema.parse({...settings,...preset.settings,distance:8,targetSpacing:3,initialStatuses:[]});
}
export function encounterPresetId(settings:EncounterSettings):string{
 return encounterPresets.find(p=>Object.entries(p.settings).every(([key,v])=>settings[key as keyof EncounterSettings]===v))?.id??'custom';
}
export const neutralEncounterModels=['unit.neutral.barkguard','unit.neutral.rootling','unit.neutral.twigcaster','unit.neutral.rootling','unit.neutral.twigcaster'];
