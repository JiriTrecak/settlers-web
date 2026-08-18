/** Public UI surface: screens, HUD, minimap, speed. */
export type { HudState } from "./hud/hud";
export { Hud } from "./hud/hud";
export { debugFrom, formatDebug, type DebugFrame, type DebugStats } from "./hud/debug";
export { GameScreen, ScreenHost } from "./screen/screen";
export { MainMenu, type MapOption, type MapOptionGroup } from "./menu/menu";
export { MapSelect } from "./menu/mapSelect";
export { NoticeScreen } from "./menu/notice";
export { ReplaySelect, type ReplayOption } from "./menu/replaySelect";
export { ReplayTimeline } from "./replay/timeline";
export {
  Minimap,
  gridToMinimapPx,
  minimapClientToGrid,
  minimapPxToGrid,
  viewportMinimapQuad,
  type MinimapCamera,
} from "./minimap/minimap";
export { GAME_SPEEDS, SpeedControl, isGameSpeed, type GameSpeed } from "./speed/speed";
export { BuildMenu, PLACEABLE, type PlaceTool } from "./build/build";
