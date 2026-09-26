import type {Definition} from './schema';

/** All distances are world units. Tune rules.unitScale in content/game.json.
 * Keep source stats and exported meshes at their authored scale; resolve once
 * per registry so simulation, UI and rendering share the same match rules. */
export function unitDimensions(scale: number) {
  return {radius: 0.2 * scale, height: 2 * scale, formationSpacing: scale};
}

export function scaleUnitDefinition(definition: Definition, scale: number): Definition {
  if (definition.kind !== 'unit') return definition;
  const {movement, combat} = definition.behaviors;
  if (movement) {
    movement.speed *= scale;
    if (movement.walkSpeed !== undefined) movement.walkSpeed *= scale;
  }
  // Longer arms/weapons need matching contact distance; ranged weapon balance,
  // damage, attack cadence and vision are independent of physical model size.
  if (combat && !combat.projectile && !combat.shell) {
    combat.range *= scale;
    combat.attack.rangeBuffer *= scale;
  }
  return definition;
}
