import type {Definition} from '../../content/schema';
import {footprintAligned, snapFootprint, type SpatialPoint} from './footprint';

type Placeable = Pick<Definition, 'kind' | 'footprint'>;
/** Authoring/cursor convenience only. Simulation rejects unsnapped intentions. */
export function snapPlacement<T extends SpatialPoint>(definition: Placeable, position: T, rotation = 0): T {
  const snapped = definition.kind === 'building' && definition.footprint
    ? snapFootprint(position, definition.footprint, rotation)
    : {x: Math.round(position.x), y: Math.round(position.y)};
  return {...position, ...snapped};
}

export function placementGeometryError(definition: Placeable, position: SpatialPoint, rotation = 0): string | null {
  if (definition.kind === 'building') {
    if (!Number.isFinite(rotation) || rotation % 90 !== 0) return 'Buildings rotate in 90-degree steps';
    if (!definition.footprint || !footprintAligned(position, definition.footprint, rotation))
      return 'Align the building footprint to the building grid';
  } else if (!Number.isInteger(position.x) || !Number.isInteger(position.y)) return 'Place units and resources on navigation cell centers';
  return null;
}
