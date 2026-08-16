import { GameApp } from "../game/GameApp";

const gameRoot = document.getElementById("game");
const hudRoot = document.getElementById("hud");
if (!gameRoot || !hudRoot) {
  throw new Error("#game or #hud missing");
}

const game = new GameApp(gameRoot, hudRoot);
void game.start();
