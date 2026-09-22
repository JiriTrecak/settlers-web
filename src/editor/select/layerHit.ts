import type {ProceduralLayer} from '../../shared/authoring/layers';
import type {LandscapeAsset} from '../../shared/authoring/catalogue';
import {regionDistance, nearestSpline, sampleBezier} from '../../shared/authoring/shapes';
import {resolveRecipe} from '../../shared/authoring/recipes';
/** Empty ground can still select the editable region/course beneath the cursor. */
export function hitLayer(layers: readonly ProceduralLayer[], assets: readonly LandscapeAsset[], x: number, z: number): ProceduralLayer | undefined {
  return [...layers].reverse().find(layer => {
    if (!layer.visible || !layer.enabled) return false;
    if (layer.shape.type !== 'spline') return regionDistance(x,z,layer.shape) >= 0;
    const defaults = assets.find(a => a.id === layer.recipe)?.recipe;
    if (!defaults) return false;
    const recipe = resolveRecipe(defaults,layer.overrides);
    const width = recipe.type === 'river' ? recipe.width/2+recipe.bankWidth : recipe.type === 'path' ? recipe.width/2+recipe.shoulder : 1;
    return nearestSpline(x,z,sampleBezier(layer.shape.knots)).offset <= width;
  });
}
