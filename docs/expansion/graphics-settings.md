# Graphics settings and performance checks

Main-menu and in-game Settings share persistent resolution and shadow controls. Resolution only changes the 3D render target; HUD text stays at display resolution. Shadow changes apply to an existing renderer immediately and are picked up by newly opened game/editor renderers.

Shadow modes:
- **Soft**: existing VSM appearance and blur passes; default retained.
- **Filtered**: PCF depth comparisons with filtered edges; avoids VSM blur passes and receiver-only shadow draws. Tree/building shadows remain.
- **Off**: no dynamic shadow pass. Authored materials and contact shading remain.

Preference: `utc.graphics.shadows`. Invalid/unavailable storage falls back to Soft. This is presentation state and never enters map files or deterministic simulation snapshots. The debug panel reports the active mode.

September 9 verification: selected Filtered in menu settings, opened Mosswater Divide, switched Off and back to Soft through in-game settings without reloading. Native render target was 2400×2408. Filtered displayed real tree/building shadows; Off removed the shadow pass; Soft resumed. Observed all-pass counts were approximately 2.31M triangles/651 draws for Filtered, 0.97M/272 for Off, and 2.90M/859 for Soft. These samples were taken at different times of day during a running match, so they are not controlled FPS comparisons. Noon reached 120fps; later filtered and soft samples did not. Whole-scene 120fps remains unproven.

Settings tests cover persistence, invalid data, unavailable storage and independence from resolution. Shader switching was verified in the actual browser; unit tests do not claim to validate GPU output.
