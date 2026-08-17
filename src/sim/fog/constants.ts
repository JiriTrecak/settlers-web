/**
 * Fog numbers. Kept off `fog.ts` so the view-circle cache can import them
 * without a cycle.
 */
export const FOG_VISIBLE = 100;
export const FOG_EXPLORED = 50;
export const FOG_PADDING = 10;
/** Sight points the dimmer may walk per second. */
export const FOG_DIM = 30;
export const FOG_REF_STEP = 10;
export const MAX_VIEW_DISTANCE = 65;
/** Finished worker hut with nobody home. */
export const UNOCCUPIED_VIEW_DISTANCE = 5;
/** Plan / scaffold. */
export const UNCONSTRUCTED_VIEW_DISTANCE = 0;
/** Civilian look radius when the settler def omits `viewDistance`. */
export const DEFAULT_UNIT_VIEW_DISTANCE = 8;
