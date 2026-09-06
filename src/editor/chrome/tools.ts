/**
 * Editor docks. Add an object to a list to put a tool on that bar.
 */
import { FilePlus, FolderOpen, Grid3x3, Library, LogOut, Save, SaveAll, TreePine } from "lucide";
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
  onCatalogue(): void;
  onGrid(): void;
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
    { id: "catalogue", label: "Catalogue", icon: Library, run: hooks.onCatalogue },
    { kind: "sep" },
    { id: "grid", label: "Grid", icon: Grid3x3, run: hooks.onGrid, latch: true },
  ];
}
