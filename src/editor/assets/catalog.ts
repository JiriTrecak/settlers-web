/**
 * Catalog of spawnable props. Every `assets/props/*.{gltf,glb}` is one card.
 */
const files = import.meta.glob("../../../assets/props/*.{gltf,glb}", {
  query: "?url",
  import: "default",
  eager: true,
}) as Record<string, string>;

export type CatalogAsset = {
  id: string;
  label: string;
  url: string;
};

export const catalog: CatalogAsset[] = Object.entries(files)
  .map(([path, url]) => {
    const file = path.split("/").pop() ?? path;
    const id = file.replace(/\.(gltf|glb)$/i, "");
    return { id, label: labelOf(id), url };
  })
  .sort((a, b) => a.label.localeCompare(b.label));

export const catalogUrls = new Map(catalog.map((a) => [a.id, a.url]));

function labelOf(id: string): string {
  return id.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
