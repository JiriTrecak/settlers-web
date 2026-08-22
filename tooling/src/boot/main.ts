/**
 * Tools Vite entry. `#game` is the Pixi canvas host, `#hud` is the screen overlay.
 */
import { ToolsApp } from "../app/ToolsApp";

const gameRoot = document.getElementById("game");
const hudRoot = document.getElementById("hud");
if (!gameRoot || !hudRoot) {
  throw new Error("#game or #hud missing");
}

const app = new ToolsApp(gameRoot, hudRoot);
void app.start();
