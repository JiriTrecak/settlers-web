import raw from "../../../assets/maps/showcase/Twinwater-Reach.utcmap?raw";
import { parseUtcMap } from "../map/utcmap";
import { mapRevision } from "../map/playable";
export const TWINWATER_ID = "twinwater-reach";
export const TWINWATER_MAP = parseUtcMap(JSON.parse(raw))!;
export const TWINWATER_REVISION = mapRevision(TWINWATER_MAP);
