/**
 * Tools Vite entry. DOM only.
 */
import "../ui/styles.css";
import { ToolsApp } from "../app/ToolsApp";

const gameRoot = document.getElementById("game");
const hudRoot = document.getElementById("hud");
if (!gameRoot || !hudRoot) {
  throw new Error("#game or #hud missing");
}

const app = new ToolsApp(gameRoot, hudRoot);
app.start();
