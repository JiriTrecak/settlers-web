import { graphicsControls } from "./graphicsControls";
/** Illustrated first screen with real, keyboard-accessible menu controls. */
import { GameScreen } from "../screen/screen";
import menuArt from "../../../assets/ui/main-menu/forest-heroes.png";
import logoArt from "../../../assets/ui/main-menu/logo-iron-wordmark.png";
import "./mainMenu.css";

export type MainMenuHooks = {
  onCampaign(): void;
  onSkirmish(): void;
  onMultiplayer(): void;
  onEditor(): void;
  playerName: string;
  onPlayerName(name: string): void;
};

export class MainMenu extends GameScreen {
  constructor(hooks: MainMenuHooks) {
    super("screen canopy-menu");
    const stage = document.createElement("main");
    stage.className = "canopy-stage";
    const art = document.createElement("img");
    art.className = "canopy-art";
    art.src = menuArt;
    art.alt = "";
    art.draggable = false;
    const title = document.createElement("h1");
    title.className = "canopy-title";
    const logo = document.createElement("img");
    logo.src = logoArt;
    logo.alt = "Under the Canopy";
    logo.draggable = false;
    title.append(logo);
    const rig = document.createElement("div");
    rig.className = "canopy-rig";
    const nav = document.createElement("nav");
    nav.className = "canopy-actions";
    nav.setAttribute("aria-label", "Main menu");
    const settings = document.createElement("dialog");
    settings.className = "canopy-settings";
    settings.setAttribute("aria-labelledby", "canopy-settings-title");
    settings.innerHTML = `<form method="dialog"><h2 id="canopy-settings-title">Settings</h2><label>Player name<input name="playerName" maxlength="32" autocomplete="nickname" required></label><div class="canopy-settings-actions"><button type="button" data-fullscreen>Fullscreen</button><button type="submit">Save &amp; return</button></div><p class="canopy-settings-status" role="status"></p></form>`;
    const input = settings.querySelector("input")!;
    input.value = hooks.playerName;
    settings.querySelector("form")!.addEventListener("submit", () => {
      hooks.onPlayerName(input.value.trim() || "player");
    });
    const fullscreen =
      settings.querySelector<HTMLButtonElement>("[data-fullscreen]")!;
    fullscreen.addEventListener("click", async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
        fullscreen.textContent = document.fullscreenElement
          ? "Exit fullscreen"
          : "Fullscreen";
      } catch {
        settings.querySelector("[role=status]")!.textContent =
          "Fullscreen is unavailable in this browser window.";
      }
    });
    const exitDialog = document.createElement("dialog");
    exitDialog.className = "canopy-settings";
    exitDialog.setAttribute("aria-labelledby", "canopy-exit-title");
    exitDialog.innerHTML = `<form method="dialog"><h2 id="canopy-exit-title">Until next time</h2><p class="canopy-settings-status">You can close this tab to exit Under the Canopy.</p><div class="canopy-settings-actions"><button type="submit">Return to menu</button></div></form>`;
    const campaign = button("Campaign", hooks.onCampaign);
    nav.append(
      campaign,
      button("Skirmish", hooks.onSkirmish),
      button("Multiplayer", hooks.onMultiplayer),
      button("Settings", () => {
        fullscreen.textContent = document.fullscreenElement
          ? "Exit fullscreen"
          : "Fullscreen";
        settings.querySelector("[data-graphics]")?.remove();
        const graphics = graphicsControls();
        graphics.dataset.graphics = "";
        settings.querySelector(".canopy-settings-actions")!.before(graphics);
        settings.showModal();
      }),
      button("Editor", hooks.onEditor),
      button("Exit", () => {
        window.close();
        if (!window.closed) exitDialog.showModal();
      }),
    );
    rig.append(title, nav);
    stage.append(art, rig);
    this.root.append(stage, settings, exitDialog);
  }
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "canopy-action";
  const text = document.createElement("span");
  text.textContent = label;
  el.append(text);
  el.addEventListener("click", onClick);
  return el;
}
