import raw from "../../../assets/maps/skirmish/worldroot-hollow.utcmap?raw";
import { parseUtcMap } from "../map/utcmap";
import { mapRevision } from "../map/playable";
export const WORLDROOT_ID = "worldroot-hollow";
export const WORLDROOT_MAP = parseUtcMap(JSON.parse(raw))!;
export const WORLDROOT_REVISION = mapRevision(WORLDROOT_MAP);
