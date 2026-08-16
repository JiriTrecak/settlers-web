# game

`GameApp`: Pixi `Application`, input, HUD updates, map load.

Canvas drag pans; minimap drag look-ats (separate flags). Space refits via `setView`. Keys 1–9 pick HUD map ids.

Map loads are generation-guarded (`loadGen`) so a slow fetch can't clobber a newer selection. Default map is first tutorial dump, else first generated preset.
