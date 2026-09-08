import raw from "../../../assets/maps/showcase/mosswater-divide.utcmap?raw";
import { parseUtcMap } from "../map/utcmap";
import { mapRevision } from "../map/playable";
export const MOSSWATER_ID = "mosswater-divide";
export const MOSSWATER_MAP = parseUtcMap(JSON.parse(raw))!;
export const MOSSWATER_REVISION = mapRevision(MOSSWATER_MAP);
