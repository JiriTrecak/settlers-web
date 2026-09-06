/**
 * Editor docks. Add an object to a list to put a tool on that bar.
 * `modes` on an action opens a sibling vertical — Grid is the first of those.
 */
import { Ban, Eraser, FilePlus, FolderOpen, Grid3x3, LayoutGrid, Library, LogOut, Mountain, Paintbrush, Save, SaveAll, TreePine, Video } from "lucide";
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
  onStamp(): void;
  onBrush(): void;
  onClean(): void;
  onSculpt(): void;
  onCatalogue(): void;
  onGrid(): void;
  onGridMode(mode: GridMode): void;
  onGameCam(): void;
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
    { id: "stamp", label: "Stamp", icon: TreePine, run: hooks.onStamp },
    { id: "brush", label: "Brush", icon: Paintbrush, run: hooks.onBrush },
    { id: "clean", label: "Clean", icon: Eraser, run: hooks.onClean },
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
    { id: "gamecam", label: "Gamecam", icon: Video, run: hooks.onGameCam, latch: true },
  ];
}
