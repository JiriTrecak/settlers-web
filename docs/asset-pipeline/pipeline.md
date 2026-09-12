# Asset generation and validation pipeline

**Design contract.** The image workflow and runtime migration are implemented. See the [Studio guide](studio.md) for the exact current surface and limitations; model-provider publication and polygon-mask authoring remain later work.

## Job lifecycle

```text
Draft → Queued → Generating → Candidate ready
                              ↓
                    Process → Validate → Review final export
                                           ↓
                                       Publish
```

Failure, cancellation and rejection are explicit states. Validation failure returns to candidate editing/regeneration; it never publishes a partial result. Approval belongs to the exact candidate hash, transform recipe, output profile and destination revision. Changing any of them requires reviewing the new final export.

A job records its ID, asset kind, subject prompt, assembled prompt, style-profile revision, reference IDs/revisions/hashes in their submitted order, provider/model, exact request parameters, returned request/task ID, output hashes, processing recipe, validation, timestamps and cost/usage when supplied. Save provider originals before decoding or resizing. Store credentials separately; redact authorization headers and expiring signed credentials from ordinary logs.

Use one shared job queue with a bounded concurrency setting. The UI shows real stages and elapsed time; provider progress is shown only when reported. “Generating” is preferable to a fabricated 83%. Disconnecting the browser must not discard a server-owned job.

On server restart, completed files are recovered; incomplete remote jobs are reconciled by task ID where the provider supports retrieval. A request with an ambiguous timeout is **unknown**, not automatically resubmitted as another paid job. Local submission IDs prevent double-click duplication; they do not imply that every provider supports idempotent billing. A retry that could create a new paid request is an explicit action. Canceling locally must also distinguish “stop waiting” from “remote generation canceled”.

## OpenAI image adapter

Keep the requested model: **`gpt-image-2`**, with a selectable pinned snapshot when available. Store model capability information separately from asset profiles, with a documentation date. Do not silently substitute a newer model.

The current API documents reference-image editing, PNG/JPEG/WebP outputs, background selection, quantity, streaming and partial images. GPT Image 2 transparency is in preview. Expose valid controls for the chosen endpoint, not the union of every model's options. [Image edit reference](https://developers.openai.com/api/reference/resources/images/methods/edit)

For GPT Image 2, use quality `auto/low/medium/high`; omit `input_fidelity` because it always uses high fidelity. Custom generation dimensions must be multiples of 16, at most 3840px per edge, aspect ratio at most 3:1, and between 655,360 and 8,294,400 pixels. Consequently, **128×128 is our export size, not a generation request**. Default icon generation to 1024×1024. [Image generation guide, earlier GPT Image models](https://developers.openai.com/api/docs/guides/image-generation#earlier-gpt-image-models)

Provider controls:

- Model/snapshot, prompt, generation width/height or automatic size, and quality.
- Background: transparent, opaque or automatic. PNG is the default; alpha-dependent profiles reject JPEG.
- Candidate count; default one, with explicit higher quantities and cost implications.
- Output format; compression only for formats that support it.
- Streaming/partial previews and the documented moderation setting.
- Reference images in visible order; optional edit mask for an edit operation.

Use image edits when supplying style/reference images, and image generation when no input images are supplied. Keep payload construction in the adapter, validated against its endpoint schema. Limits on input count, file size, output count and mask encoding are adapter validations; UI labels and server validation derive from the same capability declaration. [Image generation endpoint](https://developers.openai.com/api/reference/resources/images/methods/generate)

Do not expose fake seed, negative-prompt, style-strength or sampler controls. Our own subject restrictions are assembled into ordinary prompt text, clearly labeled as Studio guidance. Advanced users can inspect the actual sanitized request and edit supported parameters, but invalid model/parameter combinations are blocked before submission.

For transparency use the explicit API background field and a compatible file format, then inspect decoded pixels. Prompt instructions about a backdrop can defeat the intended result. Never accept “the prompt requested transparency” or a checkerboard-looking preview as proof. [OpenAI transparent-asset workflow](https://developers.openai.com/cookbook/examples/multimodal/transparent-image-assets-for-campaigns-and-presentations)

### References without style drift

A style profile stores a short art-direction brief and a curated set of approved asset IDs/revisions. A new item icon starts with up to three relevant examples, chosen by kind/style/tags and a stable tie-break. The user sees and can replace the selection. More references are possible within provider limits, but flooding a request with every icon is not the default.

Give references an explicit role: **style**, **subject**, or **layout**. A sword icon supplied for painterly material style should not accidentally dictate the shape of Heart of the Forest. An imported HUD mockup can define proportions while a separate asset defines twig material. This distinction is instruction metadata for prompt assembly, not a claimed API feature.

Use retained masters when available. Do not upscale a 128px reference and label it a master. Imported, archived and purchased assets are not automatically enrolled in style collections; their intended use is part of the asset record. Only selected reference files go to the provider.

Each generation snapshots its references. A later replacement of `command-move.png` must not silently change the history of an older job.

## Output profiles

Profiles are JSON with a checked schema. Start with a few meaningful kinds, not a general-purpose image-processing language. The processing engine owns decoding, resampling and validation; profiles own dimensions, permitted operations, padding, alpha/layout requirements and budgets.

### Icon

- Runtime format PNG, exactly **128×128**, sRGB. Also inspect a 64px preview because the command card can be smaller than the stored image.
- One clear subject; no baked labels, hotkeys or UI frame. Text and frame come from the HUD.
- Default background follows the selected icon style. Existing painted item icons can remain opaque; transparency is **not** mandatory for every icon.
- Preserve the original. Resize once from it using a pinned high-quality filter. Framing changes are an explicit crop/fit recipe; never stretch to force a square. No silent upscaling of an undersized source.
- Subject safe area: start with an 8px margin at runtime resolution, adjustable in the profile when art needs it. For opaque art, framing is visually reviewed rather than guessed from alpha bounds.
- Initial compressed-file warning budget: 64 KiB. This is a proposed budget, not a reason to damage legibility or discard valid alpha. Report decoded pixel memory separately; a 128px RGBA base image is 64 KiB before GPU overhead/mipmaps.

### Interface rim

- Separate assets for selection, minimap, commands, slot and bar rims. Generate detail once; do not rasterize names, contents or dark interior panels into the rim.
- Explicit width/height per component based on actual layout and supported display scale. Do not give every component a generic 1024px square export.
- Actual alpha outside the silhouette **and inside the intended opening**. Declare the protected opening polygon/mask and exterior regions. Test these regions, allowing only a specified antialiasing band. A single transparent corner does not satisfy the contract.
- Preview over checkerboard, white, near-black and a real game background, at actual size. Partial alpha on leaf edges is expected; painted checkerboard pixels are not.
- Non-rectangular selection silhouette: store layout anchors and shape data alongside the master. The runtime background uses the same approved opening geometry. Nine-slice only for genuinely stretchable parts; do not distort a hand-painted central arch with arbitrary CSS stretching.
- Slim borders still need readable material at runtime. Validate dimensions mechanically and visual prominence manually. There is no honest automatic “beautiful UI” check.

The current `selection.png` fails this profile: every pixel is opaque. It must not be blessed by a migration just because the old renderer hides some pixels with an SVG mask.

### HP/MP fill

The fill is a separate authored texture; the rim and numeric label are independent. Clip the fill rectangle according to the displayed fraction, preserving its original texture scale and flow. Preview 100%, 75%, 50%, 25% and 0% with numbers on top. At 0%, show the empty track, not a compressed sliver of the whole illustration. Let the renderer handle low-HP color/state and animation; do not generate four disconnected bar screenshots.

### Terrain/material textures

Declare albedo/normal/roughness/metalness/other channels, color space, dimensions, UV scale and whether tiling is required. Albedo is color data; normal/roughness/metalness are linear data. Require seam previews for tiling materials. Do not run normal maps through icon color correction or treat every texture as a transparent cutout.

Current terrain exports include 1024px and 2048px textures. Choose budgets per use and screen coverage; do not downscale these to icon dimensions during cleanup. Keep existing grass LOD JSON and shader wind behavior linked to the relevant asset rather than mistaking them for junk.

### Models (future publication support)

Publish GLB with resolved/embedded dependencies by default. Retain editable sources and original provider results outside `assets/`. Record stored and scene-instanced triangles, primitives/material groups, texture sizes and estimated decoded memory, bounds, skins, morphs, animation names and required extensions. Triangle count alone does not predict rendering cost.

Profiles cover static environment, building, skinned unit and animated vegetation. Checks include finite geometry, grounded origin, Y-up/+Z-forward where required, declared world scale, no unintended studio cameras/lights, supported materials, and real bounds/collision/deck validation. Apply optimization to an export copy, never the master.

Team ownership surfaces must use exactly **`TC_TeamColor`**. Do not recolor all red material. Verify each required player color on representative instances and preserve neutral/non-team materials. Our in-game material consolidation is part of the preview path; a provider's generic viewer is insufficient.

Characters must preserve the embedded `characterProfile`, role-to-clip mapping, required sockets, in-place movement, and authoritative attack/cast contact metadata. Validate transitions with the real controller and more than one instance. Vegetation has a separate hit/fall/decay contract at 1×; do not inherit ant playback settings.

Set budgets by role after measuring our current models. Existing trees at 740/1,365 stored triangles show why a forest profile differs from the 76,854-triangle Mound. Material consolidation, LODs, instancing and overdraw need attention alongside triangle limits. Budget exceptions are visible and justified, never silently accepted.

## Publication transaction

Publication must be recoverable and must never expose a half-written PNG or a registry pointing to a missing file.

1. Check job state, exact approval hashes, target ID and expected current revision. Reject stale edits and case-insensitive filename collisions.
2. Verify every source/reference required by the accepted recipe is retained in canonical authoring storage. Persist it before treating the job workspace as disposable.
3. Process into a staging directory on the same filesystem. Fully decode/reload outputs, validate profiles and dependencies, and generate the prospective runtime manifest and consumer diff.
4. Acquire a single publication lock. Recheck the expected revision. Journal the old manifest and all old/new file hashes so interruption can roll back or finish safely.
5. Write complete files to temporary siblings and rename them into place. Update the runtime manifest as the final logical commit. A filesystem does not provide atomic replacement of arbitrary multiple files: the local server must gate reads/hot-reload during this interval and recover journals at startup. Production builds read an immutable checked snapshot.
6. Mark publication complete, release the lock, invalidate asset caches by revision and notify Studio. Existing matches do not have their simulation content mutated; art refresh happens at a controlled reload boundary.

Check paths with realpath containment, including symlink parents. Output paths are derived from validated IDs/profiles, never trusted provider filenames or arbitrary prompt text. Local authoring endpoints bind to loopback, validate origin/session token and request limits, and serve only approved file roots. Provider keys stay on the Node side, never in `VITE_*` variables or the browser bundle.

The same service owns UI, CLI and eventual MCP publication. Manual imports use these same steps. A failed generation, validation or rename leaves the previously published revision available and its metadata consistent after recovery.

## Tests required before calling Studio reliable

- Import known RGB, RGBA and indexed-transparency PNGs; detect fake transparency and incorrect interior alpha. Reject corrupt, oversized and mismatched-extension inputs before expensive processing.
- Publish square, wide and tall candidates to an icon profile with explicit framing. Verify dimensions, alpha edges, color and no unintended stretch/upscale. Inspect the exported 128px image, not only the master.
- Generate from selected references; reopen the job and verify the exact ordered reference bytes/parameters. The old reference set survives a subsequent asset replacement.
- Mock provider failure, timeout, duplicate submission, cancellation and browser/server restart. Confirm no accidental second paid submission and no publication of partial previews.
- Fail publication at each filesystem step; reopen the service and verify either the complete old revision or complete new revision, never a mixed registry/file state.
- Replace an in-use icon and inspect all consumers; reject stale approval and conflicting concurrent edits. Verify cache refresh.
- Audit the production bundle: only manifest-selected runtime assets, no masters, provider outputs, keys, old sprite dump or rejected candidates.
- Load all shipped maps, campaign, UI states, animated characters and editor scenery after migration. Preserve collision, bridges, harvest animations, team colors and four-player startup.
- Test the exact same creation/import/publication operations from the agent interface. Direct filesystem copying is not the acceptance path.

No API key or billable generation is necessary to test most of this. Add a small, explicit real-provider smoke test once credentials are configured; mock success does not establish provider access or output quality.
