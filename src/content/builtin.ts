import {renderAssets} from "../shared/assets/manifest";
import source from "../../content/game.json";
import { ContentRegistry, type ContentSource } from "./registry";
/** One atomically saved source document; categories are exposed by the authoring UI. */
export const builtinSource: ContentSource = {...source,assets:renderAssets};
export const content = new ContentRegistry(builtinSource);
