# Briarwatch quest rewards

Original generated reference sheet and original Blender geometry for the Briarwatch reference mission. The reference uses the game's existing Barkguard and Resin Salve icons for material and silhouette continuity. Image generation requested six separate centered icons in a 3×2 sheet: leaf ledger, amber vigor seed, family ring, red healing draught, blue mana draught, and healing scroll. No text or borders. The returned sheet has a soft dark backdrop, which is retained inside the inventory cards.

`model.py` is the deterministic recipe; `samples.json` records the material sample coordinates and `palette.json` records the actual source pixels. These are lit illustration colors, not measured physical albedos. Small details and the unseen undersides are interpreted.

Rebuild through the studio at http://127.0.0.1:8922 using its build action. `briarwatch-rewards.blend` is the editable source. Six separate GLBs contain centered, closed ground-item models. Opaque resin avoids transparency sorting, and the game supplies pickup glow/motion. They have no clips or team-colored surfaces.

Publish with `node --import tsx scripts/assets/publish-briarwatch.ts`. Publish icons with `node --import tsx scripts/assets/publish-briarwatch-icons.ts`; this uses the Asset Studio processor to crop the exact 512px source cells, resize to 128×128 with Lanczos filtering, validate, hash, register and compile the manifest. No runtime icon exceeds 128×128.
