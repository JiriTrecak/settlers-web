/** Public session surface: match class, map fetch, canvas input. */
export { Session, type SessionConfig, type SessionHooks } from "./session/session";
export { MapInput } from "./input/mapInput";
export {
  defaultMapId,
  FALLBACK_MAP_ID,
  fetchDumpedMap,
  fetchMapCatalog,
  mapPickerOptions,
  type DumpedMap,
  type MapCatalogEntry,
  type MapGroup,
} from "./maps/maps";
