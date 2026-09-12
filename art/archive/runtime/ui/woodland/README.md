# Vanguard woodland HUD textures

See [the implementation contract](../../../docs/woodland-hud.md). These are reusable empty backgrounds, not screenshots of controls.

- `selection.png`: shaped dark bark panel. Use with `selection-mask.svg`, or `selection-portrait-mask.svg` when the live model viewport is present. Outside the mask is not usable image content.
- `map-frame.png`: transparent twig-and-leaf border; also nine-sliced for resource and spell ribbons.
- `slot.png`: 128×128 shared command/inventory/queue well. Live icons are inset inside its thin border.
- `satchel.png`: 256×256 leather backing; displayed at 30% opacity behind the four item slots.
- `generation.json`: imagegen prompts and original generated filenames.

All text, numeric bars, progress, cooldowns, icons, focus/hover states and click targets are code-rendered. Do not paint these into the texture.
