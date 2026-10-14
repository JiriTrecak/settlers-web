import authoring from '../fixtures/content/authoring.json';
import {assetDefinitionSchema} from '../../src/shared/authoring/asset';
import {landscapeCatalogue} from '../../src/shared/authoring/catalogue';
/** Test-owned landscape catalogue (recipes, water profiles, terrain materials and scenery models) derived from the
 * test authoring fixture, so generator and editor tests do not depend on the shipped `assets/authoring/catalogue.json`. */
export const testLandscape=landscapeCatalogue(authoring.assets.map(asset=>assetDefinitionSchema.parse(asset)));
