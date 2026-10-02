import {libraryKindSchema,treeActionSchema} from './libraryTree';
import {effectPreviewSettingsSchema} from './effectPreview';
import {visualEffectSchema} from '../../../src/content/effects/schema';
import {z} from 'zod';
import {abilitySchema,presentationSchema,abilityId,abilityCasterSchema} from '../../../src/content/abilities/schema';
import {encounterSettingsSchema} from '../../../src/content/abilities/encounter';
export const documentSchema=z.object({definition:abilitySchema,presentation:presentationSchema}).strict().refine(d=>d.definition.presentation===d.presentation.id,'Presentation ID does not match');
export type SpellDocument=z.infer<typeof documentSchema>;
export const spellCommandSchema=z.discriminatedUnion('op',[
 z.object({op:z.literal('tree.read'),kind:libraryKindSchema}).strict(),
 z.object({op:z.literal('tree.mutate'),kind:libraryKindSchema,action:treeActionSchema,expectedRevision:z.string()}).strict(),
 z.object({op:z.literal('effects.preview.load'),document:visualEffectSchema,settings:effectPreviewSettingsSchema.default(()=>effectPreviewSettingsSchema.parse({}))}).strict(),
 z.object({op:z.literal('effects.preview.state')}).strict(),
 z.object({op:z.literal('effects.preview.seek'),tick:z.number().min(0).max(12000)}).strict(),
 z.object({op:z.literal('effects.preview.play'),playing:z.boolean(),speed:z.number().min(.1).max(4).default(1)}).strict(),
 z.object({op:z.literal('effects.preview.stop')}).strict(),
 z.object({op:z.literal('effects.list')}).strict(),
 z.object({op:z.literal('effects.library')}).strict(),
 z.object({op:z.literal('effects.read'),id:abilityId}).strict(),
 z.object({op:z.literal('effects.validate'),document:visualEffectSchema}).strict(),
 z.object({op:z.literal('effects.save'),document:visualEffectSchema,expectedRevision:z.string().nullable()}).strict(),
 z.object({op:z.literal('effects.publish'),id:abilityId,expectedRevision:z.string()}).strict(),
 z.object({op:z.literal('list')}).strict(),
 z.object({op:z.literal('catalog')}).strict(),
 z.object({op:z.literal('binding.read'),definition:abilityId}).strict(),
 z.object({op:z.literal('bind'),definition:abilityId,caster:abilityCasterSchema,expectedRevision:z.string()}).strict(),
 z.object({op:z.literal('read'),id:abilityId}).strict(),
 z.object({op:z.literal('save'),document:documentSchema,expectedRevision:z.string().nullable()}).strict(),
 z.object({op:z.literal('validate'),document:documentSchema}).strict(),
 z.object({op:z.literal('publish'),id:abilityId,expectedRevision:z.string()}).strict(),
 z.object({op:z.literal('preview.load'),document:documentSchema,settings:encounterSettingsSchema}).strict(),
 z.object({op:z.literal('preview.state')}).strict(),
 z.object({op:z.literal('preview.aim'),position:z.object({x:z.number().int().min(0).max(255),y:z.number().int().min(0).max(255)}).strict()}).strict(),
 z.object({op:z.literal('preview.cast')}).strict(),
 z.object({op:z.literal('preview.beginCast')}).strict(),
 z.object({op:z.literal('preview.confirmTarget'),target:z.discriminatedUnion('kind',[z.object({kind:z.literal('point'),position:z.object({x:z.number().int().min(0).max(255),y:z.number().int().min(0).max(255)}).strict()}).strict(),z.object({kind:z.literal('unit'),entity:z.number().int().min(0)}).strict()])}).strict(),
 z.object({op:z.literal('preview.target'),entity:z.number().int().min(0)}).strict(),
 z.object({op:z.literal('preview.seek'),tick:z.number().int().min(0).max(12000)}).strict(),
 z.object({op:z.literal('preview.autocast'),enabled:z.boolean()}).strict(),
 z.object({op:z.literal('preview.attack')}).strict(),
 z.object({op:z.literal('preview.stop')}).strict(),
 z.object({op:z.literal('preview.play'),playing:z.boolean(),speed:z.number().min(.1).max(4).default(1)}).strict(),
 z.object({op:z.literal('preview.step'),ticks:z.number().int().min(1).max(400).default(1)}).strict(),
 z.object({op:z.literal('preview.reset')}).strict(),
 z.object({op:z.literal('preview.kill'),subject:z.enum(['caster','target'])}).strict(),
 z.object({op:z.literal('preview.replay'),from:z.enum(['start','release']).default('start'),tick:z.number().int().min(0).max(400)}).strict(),
 z.object({op:z.literal('preview.stun'),ticks:z.number().int().min(1).max(400)}).strict(),
 z.object({op:z.literal('preview.displace'),distance:z.number().min(1).max(30)}).strict(),
 z.object({op:z.literal('preview.rank'),rank:z.number().int().min(1).max(10)}).strict(),
]);
export type SpellCommand=z.infer<typeof spellCommandSchema>;
