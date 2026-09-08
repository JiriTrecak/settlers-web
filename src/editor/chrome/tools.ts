/**
 * Editor docks. Add an object to a list to put a tool on that bar.
 * `modes` on an action opens a sibling vertical — Grid is the first of those.
 */
import { Ban, Cable, Eraser, FilePlus, FolderOpen, Grid3x3, LayoutGrid, Library, LogOut, Mountain, MousePointer2, Paintbrush, Save, SaveAll, Sun, TreePine, Play, Sticker } from "lucide";
import type { GridMode } from "../../shared";
import type { IconItem } from "../../ui";

export type FileToolHooks = {
  onNew(): void;
  onSave(): void;
  onSaveAs(): void;
  onLoad(): void;
  onLeave(): void;
};

export type GameToolHooks = {
  onSelect(): void;
  onStamp(): void;
  onBrush(): void;
  onClean(): void;
  onSculpt(): void;
  onTerrain(): void;
  onDecal(): void;
  onCatalogue(): void;
  onGrid(): void;
  onGridMode(mode: GridMode): void;
  onGameCam(): void;
  onMcp(): void;
  onSky(): void;
};

export function fileTools(hooks: FileToolHooks): IconItem[] {
  return [
    { id: "new", label: "New", icon: FilePlus, run: hooks.onNew },
    { id: "save", label: "Save", icon: Save, run: hooks.onSave },
    { id: "save-as", label: "Save as", icon: SaveAll, run: hooks.onSaveAs },
    { id: "load", label: "Load", icon: FolderOpen, run: hooks.onLoad },
    { kind: "sep" },
    { id: "exit", label: "Exit", icon: LogOut, run: hooks.onLeave },
  ];
}

export function gameTools(hooks: GameToolHooks): IconItem[] {
  return [
    { id: "select", label: "Select", icon: MousePointer2, run: hooks.onSelect },
    { id: "stamp", label: "Stamp", icon: TreePine, run: hooks.onStamp },
    { id: "brush", label: "Brush", icon: Paintbrush, run: hooks.onBrush },
    { id: "clean", label: "Clean", icon: Eraser, run: hooks.onClean },
    { id: "terrain", label: "Terrain", icon: Paintbrush, run: hooks.onTerrain },
    { id: "decal", label: "Decals", icon: Sticker, run: hooks.onDecal },
    { id: "sculpt", label: "Sculpt", icon: Mountain, run: hooks.onSculpt },
    { id: "catalogue", label: "Catalogue", icon: Library, run: hooks.onCatalogue },
    { kind: "sep" },
    {
      id: "grid",
      label: "Grid",
      icon: Grid3x3,
      run: hooks.onGrid,
      latch: true,
      modes: [
        { id: "tiles", label: "Tiles", icon: LayoutGrid, run: () => hooks.onGridMode("tiles") },
        { id: "full", label: "Full", icon: Grid3x3, run: () => hooks.onGridMode("full") },
        { id: "none", label: "None", icon: Ban, run: () => hooks.onGridMode("none") },
      ],
    },
    { id: "sky", label: "Environment", icon: Sun, run: hooks.onSky, latch: true },
    { id: "mcp", label: "MCP", icon: Cable, run: hooks.onMcp, latch: true },
    { id: "play", label: "Play", icon: Play, run: hooks.onGameCam, latch: true },
  ];
}
