export type Civ = "roman" | "egyptian" | "asian" | "amazon";

export type CatalogRef = {
  file: number;
  kind: "settler" | "gui" | "landscape" | "torso" | "shadow";
  sequence: number;
  frame: number;
};

export type BuildingEntry = {
  id: string;
  civ: Civ;
  building: string;
  built: CatalogRef[];
  scaffold: CatalogRef[];
  gui: CatalogRef | null;
};

export function catalogId(civ: Civ, building: string): string {
  return `building/${civ}/${building}`;
}

export function originKey(ref: CatalogRef): string {
  return `original_${ref.file}_${ref.kind.toUpperCase()}_${ref.sequence}_${ref.frame}`;
}
