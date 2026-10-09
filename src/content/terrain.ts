import {BUILDING_CELL_SIZE,GRID_ORIGIN} from '../shared/spatial/footprint';
/** Shared editor declarations. Elevation levels use world units; water depths
 * remain separate from levels so a ford need not consume a whole height tier. */
export const TERRAIN_AUTHORING={
 cellSize:BUILDING_CELL_SIZE,origin:GRID_ORIGIN,levelHeight:2,
 shallowDepth:.32,deepDepth:1.8,bankCells:1,
} as const;
