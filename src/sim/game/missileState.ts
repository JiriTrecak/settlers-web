/** Saved in-flight projectile. Damage is post-upgrade/charge and may be fractional. */
import {z} from 'zod';
import {spellSourceSchema} from '../abilities/state';
import {idSchema, ownerSchema,surfaceSchema} from '../../content/schema';
const point=z.object({elevation:z.number().nonnegative().max(1024).optional(),surface:surfaceSchema.optional(),x:z.number().finite().nonnegative(),y:z.number().finite().nonnegative()}).strict();
export const weaponEnhancementSchema=z.object({ability:idSchema,rank:z.number().int().min(1).max(10),status:z.string().max(48).optional(),sourceContext:spellSourceSchema.optional(),bonus:z.number().int().min(0).max(1000000),cast:z.number().int().positive()}).strict();
export type WeaponEnhancement=z.infer<typeof weaponEnhancementSchema>;
export const missileSchema=z.object({
 id:z.number().int().positive(),source:z.number().int().positive(),target:z.number().int().positive(),
 definition:idSchema,owner:ownerSchema,origin:point,destination:point,
 launched:z.number().int().nonnegative(),impact:z.number().int().nonnegative(),
 criticalAbility:idSchema.optional(),enhancement:weaponEnhancementSchema.optional(),
 damage:z.number().positive(),damageType:idSchema,viewers:z.array(ownerSchema),resolved:z.boolean(),
}).strict();
