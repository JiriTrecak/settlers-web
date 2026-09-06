/**
 * Bundled project catalogue. Mesh URLs come from Vite; the JSON is the listing.
 */
import raw from "../../../assets/catalog.json";
import { parseCatalogue, PROJECT_CATALOG_PATH, type Catalogue } from "../../shared";

const meshes = import.meta.glob("../../../assets/**/*.{gltf,glb}", {
  query: "?url",
  import: "default",
  eager: true,
}) as Record<string, string>;

export function projectCatalogue(): Catalogue {
  const doc = parseCatalogue(raw);
  if (!doc) throw new Error(`${PROJECT_CATALOG_PATH} is invalid`);
  return doc;
}

export function projectMeshUrl(rel: string): string | undefined {
  const norm = rel.replace(/^\.\//, "").replace(/\\/g, "/");
  for (const [path, url] of Object.entries(meshes)) {
    const n = path.replace(/\\/g, "/");
    if (n.endsWith(`/${norm}`) || n.endsWith(norm)) return url;
  }
  return undefined;
}
