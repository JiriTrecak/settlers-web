---
name: release-canopy
description: Maintain Under the Canopy's shared player-facing release log, prepare and build signed desktop releases, publish them to the game's AWS release host, and verify desktop updates. Use when changing player-visible behavior or working on game releases.
---

# Under the Canopy releases

Use the repository's `releases/log.json` as the only release log. All agents contribute to its `unreleased` section. Do not create per-agent changelogs or separate release-note drafts.

## During normal development

After completing a player-visible change, append a concise note through the concurrent-write-safe command:

```sh
npm run release:note -- --kind fixed --text "Describe the player-visible improvement."
```

Kinds: `added`, `improved`, `fixed`, `knownIssues`. Combine related work into useful notes; skip internal-only refactors. Preserve other agents' notes. Exact duplicate entries are ignored. `npm run release:check` validates the log.

## Release galleries

Attach selected screenshots to Unreleased with `npm run release:image -- --file "/path/to/screenshot.png" --caption "What the image shows"`. Use `--alt` when the accessible description should differ from the caption. This stores an optimized, metadata-free WebP in `releases/media/` and adds its reference to the shared log under the same write lock. Only include images relevant to the release; do not add test fixtures or unrelated concept art.

Up to eight images per release; longest edge 1600px and each optimized file at most 768 KiB. Static PNG, JPEG and WebP inputs are supported. Do not edit frozen image files or captions. Preparing freezes the gallery with the notes; build stages its media, and publishing uploads/verifies media before promoting the feed. Keep referenced `releases/media/` files in Git for offline galleries. Never put arbitrary external image URLs in the log.

## Version policy

Use patch releases (`0.2.1`, `0.2.2`, …) for routine fixes, improvements and features. Reserve pre-1.0 minor versions (`0.X.0`) for agreed major upgrades such as a new playable race. `0.7.0` is the planned public early-access milestone; `1.0.0` is the full release. Do not advance toward those milestones merely because notes accumulated. `release:prepare` requires `--milestone` for a minor/major bump and prevents skipped versions.

## Preparing and publishing

Read `infrastructure/releases/README.md` for the executable workflow and deployment details. Preparing freezes Unreleased into a version and updates the app version. Do not prepare or publish a release merely because you fixed a bug; those operations require the user's release intent. Existing authorization in the current conversation applies.

- Released notes are immutable. Add subsequent corrections to Unreleased or prepare a new version.
- Use the supported scripts, not hand-written S3 uploads or manual manifest edits.
- Validate the intended AWS account (`533797168831`); other local AWS accounts may belong to unrelated projects.
- Signing private key: `~/.config/under-the-canopy/updater.key`, or the `TAURI_SIGNING_PRIVATE_KEY` credential supplied by CI. Never display it, put it in the repository, or upload it with releases. Back it up securely; losing it prevents updates to installed apps.
- Use the shared log for published changelog JSON, update notes and the bundled offline main-menu view. Never maintain those outputs separately.
- A release build stages a verified package under `build/releases/<version>/<platform>/artifact.json`. Publish that manifest; never publish an arbitrary local build.
- Uploads are immutable, a publisher lock prevents conflicting promotions, and the stable feed is written last. A conflict needs diagnosis, not forced overwrites. A stale publisher lock may be removed only after confirming its owner has stopped.
- Test a real older-to-newer update in a disposable app copy. Keep the same app identifier so saves/settings retain their identity. Check signature failures, offline behavior, notes, download progress, restart, and the final version. Report platforms you actually built/tested.

The native app checks for updates automatically on entering the main menu and reports availability in its version indicator. Downloading and installation require explicit main-menu actions. Do not add background installation or restart a running match.
