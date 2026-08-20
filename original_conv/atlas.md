# sprite atlases

Cook-time pack of catalog PNGs into civ-paged sheets. Landscape stays `landscape-atlas.png` (wrap UVs). HUD `<img>` still uses loose catalog paths.

```
npm run pack:atlases          # 2048², all packs
npm run pack:atlases -- --size 1024
```

Writes `assets/graphics/atlases/` (`manifest.json`, `*-N.png`, `index.html`). `loadTexture(path)` hits the manifest first; missing pack → loose PNG.

Packs: `props`, `buildings-{civ}`, `settlers-{civ}`, `settlers-shared`. Match loads props + civs in play. 2048 ≈ 10 roman settler pages; 1024 ≈ 40.
