import source from "../../content/game.json";
import { ContentRegistry, type ContentSource } from "./registry";
/** One atomically saved source document; categories are exposed by the authoring UI. */
export const builtinSource: ContentSource = source;
export const content = new ContentRegistry(builtinSource);
