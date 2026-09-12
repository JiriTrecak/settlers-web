# Asset Studio

Asset Studio is the local image workshop and published-asset library for **Under the Canopy**. Start it with `npm run dev:tools`, then open **http://127.0.0.1:5175/**. The game stays on port 5173; the wiki uses its own server.

## Create an icon

1. Open **Provider settings**, paste an OpenAI API key, and save it locally. Saving does not make a paid request. The presence indicator never returns the saved key.
2. Choose **Create asset**. Give it a name such as *Heart of the Forest*, choose the category and check the filename slug.
3. Describe the subject. Choose a style collection and inspect its selected references. Click references to add/remove them; assign **style**, **subject** or **layout** roles. Only selected images are sent to OpenAI.
4. Choose the API quality, background and candidate count. The default generation size is 1024×1024. **The game export is 128×128**, not the generation request size.
5. Generate. The server owns the job, so closing the browser does not cancel it. The job list shows its actual state without fabricated progress percentages.
6. Open the completed job. Inspect the final export at 128px and 64px. Use **Reprocess originals** to change containment/center cropping or enter a crop rectangle in original-image pixels. Processing always starts from retained original bytes. No stretching or silent upscaling.
7. **Approve this export**, then **Publish to game**. Approval is attached to the exact source/output hashes, request and target revision. Reframing clears it.
8. The asset appears in the library. An icon can be assigned to an existing unit, building or item using **Assign to a game definition**. Replacing an existing asset keeps its render IDs, so all consumers receive the same replacement after a deliberate game reload.

**Import your own image** takes PNG, JPEG or WebP through the same decoding, framing, validation, approval and publication steps, without making an API call.

A real provider smoke test created and published **Heart of the Forest** with GPT Image 2, three retained item references, medium quality and one candidate. Its 128px PNG is about 21 KiB. It is a library asset; no unit stats or item mechanics were added by this test.

## API controls

The implemented adapter uses `gpt-image-2`, with the selectable `gpt-image-2-2026-04-21` snapshot. It exposes quality, generation dimensions, background, PNG/JPEG/WebP, applicable compression, candidate count, moderation, streaming and partial-image count. References use the edits endpoint; a request without references uses generations. An optional PNG edit mask must match reference 1's dimensions and include alpha.

There is no invented seed, sampler or style-strength control. Reference roles are instructions in the assembled prompt, not a claimed API parameter. The job inspector shows the assembled prompt, parameters, reference hashes and returned usage. Model capabilities were checked against the [image generation](https://developers.openai.com/api/reference/resources/images/methods/generate) and [image editing](https://developers.openai.com/api/reference/resources/images/methods/edit) API documentation.

A failed or interrupted request is not silently resubmitted. An ambiguous result is **unknown**; a new generation requires a new user submission. Canceling an in-flight request stops local waiting; it does not promise that the provider stopped or will not bill it. A local submission ID deduplicates repeated delivery of that same request.

## Interface images

Four checked JSON profiles live in `art/profiles/images.json`:

- **Icon:** 128×128 sRGB PNG; 64 KiB warning budget; optional alpha.
- **Interface rim:** component-specific size; alpha required across both the declared protected opening and the exterior pixel edge. The current opening tool is a normalized rectangle, not an arbitrary polygon editor.
- **Interface fill:** separate textured HP/MP fill. The reviewer shows it clipped at 100%, 75%, 50%, 25% and 0% without squeezing the texture.
- **Interface image:** general image with a declared export size.

The reviewer supports checkerboard, white and near-black backdrops. Validation examines decoded alpha. A painted checkerboard or a transparent corner cannot qualify a solid-center image as a rim. The current migrated opaque selection artwork remains an **interface image**, not a validated transparent rim. This migration does not regenerate the HUD.

Mechanical validation is not an aesthetic verdict. Check silhouette, legibility, material treatment and framing before approval. The current validator does not detect baked text or evaluate visual quality automatically.

## Where things live

`assets/` contains published runtime files:

- `icons/`: flat, consistently named PNGs such as `command-move.png`, `unit-ants-worker.png`, `item-heart-of-the-forest.png`.
- `interface/`: woodland HUD, main menu and app artwork.
- `models/buildings/{ants,neutral}/`, `models/units/{ants,neutral}/`, `models/environment/{trees,grass,mushrooms,rocks,structures}/`, `models/items/`: per-model directories with self-contained `model.glb` exports. Future factions use their own folders.
- `textures/`: terrain, roads, vegetation and material data.
- `maps/`: the four existing campaign/skirmish maps, retaining their scenario IDs.
- `manifest.json`: the generated runtime listing.

`art/records/<asset-id>/asset.json` is the authoring record. It carries stable render/scenery bindings, outputs, hashes, revision, profile, source and provenance. Keeping records keyed by identity lets one physical asset support multiple existing render or scenery IDs without duplicating its GLB.

`art/sources/` contains the former Blender experiments, editable models, recipes and pack sources. Exact-matching model exports and the purchased conifer pack are linked to their shared Blender sources. A retained runtime image is explicitly marked **runtime-only** when an exact master has not been established; the importer does not invent source provenance from a similar filename.

New image revisions retain their original bytes, complete job, reference snapshots and recipes under their asset record. These survive removal of the disposable workspace. Shared source models are not copied into every related asset record.

`art/styles/` holds curated image-reference collections. `art/references/` holds comparison images. `art/archive/` preserves superseded exports and old generators outside the runtime build. The old ignored sprite dump is quarantined in the ignored local workspace rather than accidentally added to Git.

`.asset-work/` contains jobs, credentials, partial previews and publication journals. It is ignored by Git and denied by both game and Studio Vite file servers. Keys use a restricted-permission local file, or the server's `OPENAI_API_KEY` environment variable. Credentials are never written into jobs, manifests or browser bundles.

## Runtime integration and migration

The game, editor and wiki consume `assets/manifest.json`. The compiler emits explicit Vite URL imports in `src/shared/assets/urls.generated.ts`. There is no wildcard model discovery, suffix-based lookup or hidden archive fallback. `content/game.json` contains gameplay definitions rather than another physical-file asset listing; the loader composes the manifest's render bindings in memory.

Existing gameplay/scenery IDs, bridge decks, blockers, lights, team materials, harvest clips and character profiles were preserved. The 112 JSON glTF exports were repacked as GLB without simplifying geometry or re-encoding textures; every original buffer-view payload was checked against its new location. The path ledger is `art/migrations/2026-09-11-paths.json`.

This is a content-revision boundary. Existing save/network fingerprint checks remain strict; saves made against the old physical asset listing may be rejected. Start a fresh match after the migration.

Use `npm run assets:compile` to validate published hashes and regenerate the manifest/URL module from reviewed authoring records. Build validation rejects missing or changed runtime files. Do not use the historical migration scripts or archived generators as a second publication path. The Blender studio still exports editable source work; automated model publication and Meshy generation are a later adapter, not an implemented cloud feature.

## Recovery and concurrency

The local service runs one provider request at a time and serializes review/publication mutations. CLI commands use that same running server, rather than starting another writer.

Publication persists canonical source/provenance, verifies current revision and exact approval, checks all existing output hashes, then journals the destination files. Complete temporary files are renamed into place; the manifest is the final logical commit. On interruption, pending journals roll back and completed publication is reconciled to its job. Studio reads wait behind publication; the game dev server gates asset requests during the short commit window and suppresses asset hot reload. Reload after publication to pick up the revision.

This is local authoring tooling. Do not expose the Vite service publicly. It binds loopback and requires a same-origin session token for writes. It is not a multi-user production asset server.

## Agent and terminal workflow

Run the Studio server first. Then:

```sh
npm run assets:studio -- library
npm run assets:studio -- jobs
npm run assets:studio -- create tmp/request.json
npm run assets:studio -- approve tmp/approval.json
npm run assets:studio -- publish tmp/approval.json
npm run assets:studio -- targets
npm run assets:studio -- assign tmp/assignment.json
```

`create` accepts `{ "request": ... }` using `jobRequestSchema` in `tooling/asset-studio/shared/schema.ts`. Add `importFile` for a local manual import. `approve` takes `{ "job", "candidate", "outputHash" }`; `publish` takes `{ "job", "candidate" }`. `process` takes `{ "job", "candidate", "transform" }`; `cancel` takes `{ "job" }`. `assign` takes `{ "asset", "definition", "revision" }`, with the current definition revision from `targets`.

Do not put API keys in request files, command arguments, prompts or chat. Use Provider settings or the server environment.

## Verification

The full suite passed 727 tests across 170 files after the migration, including real socket tests. Focused Studio tests exercise actual image decoding, no-upscale exports, alpha openings, path/symlink containment, credential permissions, duplicate submissions, stale approvals/revisions, ambiguous provider failures, restart behavior and rollback at each write. The game and Studio production builds and generated wiki were checked separately. The 38 purchased vegetation exports passed geometry, color, grounding and animation validation against the new paths.

Meshy generation, arbitrary protected-opening polygons, a visual crop-handle editor and automatic aesthetic scoring are not part of this version.

The Studio and game Vite servers keep separate dependency caches so both can run at once without invalidating model-preview modules.
