export type MapGroup = "tutorial" | "single" | "multi";

export type MapCatalogEntry = {
  id: string;
  name: string;
  file: string;
  group: MapGroup;
  size: number;
  players: number;
  quest: string;
};

export type MapCatalog = {
  maps: MapCatalogEntry[];
};
