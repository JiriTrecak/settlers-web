import raw from '../../../content/effects/published.json';
import {effectLibrarySchema,resolveEffectBindings} from './schema';
import type {AbilityPresentation} from '../abilities/schema';
export const coreEffects=effectLibrarySchema.parse(raw).effects;
export function presentationRecipes(p:AbilityPresentation,effects=coreEffects){return resolveEffectBindings(p.effects,effects);}
