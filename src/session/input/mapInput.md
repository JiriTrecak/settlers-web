# mapInput

Canvas pointer + WASD + wheel + space (fit) + Escape (deselect) + Delete / Backspace (destroy selected hut) + C (convert selected bearer ↔ pioneer) + X (enlist selected bearer as swordsman).

LMB click selects a pioneer or swordsman (shift+click toggles). Bearers / workers are click-through. Shift+LMB drag is a marquee against sprite AABBs (`boxSelect.ts` + `SettlerLayer.idsInScreenBox`). Plain LMB drag pans. RMB commands the group (shift = forced walk). Empty LMB clears selection — it does not issue a move. No tile hover outline.

Mutates `Camera`; session applies it. Does not know about HUD or minimap.
