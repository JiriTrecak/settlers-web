/** Test-owned content world.
 * Capability tests build games and registries from these fixtures only. Shipped content (content/game.json,
 * content/abilities, content/effects, the asset manifest) is never loaded here, so authors may change or delete shipped
 * units, abilities and effects without affecting engine coverage.
 * Every id is test-scoped: unit.test.*, building.test.*, item.test.*, resource.test.*, ability.test.*,
 * presentation.test.*, effect.test.*, asset.test.*, icon.test.*, research.test.*; races are `alpha` and `beta`. */
import world from './world.json';
import abilities from './abilities.json';
import effects from './effects.json';
import {ContentRegistry,type ContentSource} from '../../../src/content/registry';
import {abilityLibrarySchema} from '../../../src/content/abilities/schema';
import {effectLibrarySchema} from '../../../src/content/effects/schema';

/** Test ability library (abilities + presentations). */
export const testAbilities=abilityLibrarySchema.parse(abilities);
/** Test visual effects referenced by the test presentations. */
export const testEffects=effectLibrarySchema.parse(effects).effects;
/** A fresh, mutable copy of the test content source. */
export const testSource=():ContentSource=>structuredClone({...world,abilityLibrary:testAbilities});
/** A registry over the test content source. */
export const testContent=new ContentRegistry(testSource());
