import published from '../../../content/abilities/published.json';
import {ABILITY_ABI,abilityLibrarySchema} from './schema';
/** Matches consume the published snapshot, never a mutable authoring draft. */
if(published.abi!==ABILITY_ABI)throw Error('Published abilities require another engine ABI');
export const coreAbilities=abilityLibrarySchema.parse(published.library);
