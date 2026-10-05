# Desktop releases

All agents maintain **`releases/log.json`**. Its Unreleased section collects completed user-facing changes. Frozen entries feed the app's offline changelog, Tauri release notes and hosted changelog JSON. There is no second hand-maintained changelog.

## Daily changes

```sh
npm run release:note -- --kind fixed --text "Describe the player-visible fix."
npm run release:check
```

Use `added`, `improved`, `fixed` or `knownIssues`. The note command locks the shared log, preserves other agents' entries and ignores exact duplicates. A stale `releases/log.json.lock` needs its owner checked before removal. Read [the release skill](../../docs/skills/release-canopy/SKILL.md); it is also discoverable as `release-canopy` in the local Codex skills directory. Root `AGENTS.md` directs every agent to this log.

## Optional image galleries

Add a screenshot to the shared Unreleased entry:

```sh
npm run release:image -- --file "/path/to/screenshot.png" --caption "A new view of the forest" --alt "Ant warriors beside the new forest landmark"
npm run release:check
```

`--alt` defaults to the caption; provide at least one meaningful description. The command accepts static PNG, JPEG and WebP (up to 25 MiB / 40 million input pixels), rotates to the correct orientation, strips metadata, and creates a WebP with a maximum 1600px edge and 768 KiB size. Each release allows up to eight unique images, shown in their array order. Only optimized files are stored in `releases/media/`; retain and commit referenced files. Avoid committing original high-resolution screenshots.

Images and captions are frozen with the release. `release:check` verifies filenames against content hashes and checks dimensions; `release:build` stages media beside the artifact, and `release:publish` checks and uploads every image before its changelog or stable feed. The CDN copy is verified too. Existing releases without images remain valid.

The timeline displays lazy-loaded thumbnails and captions. Clicking opens a larger viewer; use previous/next buttons or arrow keys, and Escape returns to the changelog. Bundled images work offline; upcoming release images use the same HTTPS release host. Unavailable images never prevent reading notes or installing an update. To revise or reorder a gallery before freezing, edit only the Unreleased `images` array and run `release:check`; never change a published gallery.

## Version policy

Routine changes—including normal features, polish and fixes—use patch releases: `0.2.1`, `0.2.2`, and so on. Pre-1.0 minor releases (`0.X.0`) are reserved for explicitly agreed major upgrades, such as adding a playable race. `0.7.0` is the planned public early-access milestone, and `1.0.0` is the full release. The existing published 0.2.0 is retained.

`release:prepare` allows the next patch by default. The next minor or major requires `--milestone`; skipped versions are rejected. This flag records deliberate intent in the invocation—it does not authorize agents to choose a milestone themselves. For example, an approved new-race milestone could use `npm run release:prepare -- 0.3.0 --milestone --title "New playable race"`.

## Release workflow

From the repository root, after completing the intended changes and relevant checks:

```sh
npm run release:prepare -- 0.2.1 --title "Short release title"
npm run release:build
npm run release:publish -- --artifact build/releases/0.2.1/darwin-aarch64/artifact.json
npm run release:publish -- --artifact build/releases/0.2.1/darwin-aarch64/artifact.json --apply
```

1. **Prepare** atomically moves Unreleased into the named version, clears Unreleased, and updates `src-tauri/tauri.conf.json`. This is the app version authority; Cargo's library package version is independent. Never change frozen notes after publishing. Corrections belong to a new release.
2. **Build** compiles and signs the host platform, verifies the package and its version-bound minisign signature, then stages binaries plus `artifact.json` and `changelog.json` under `build/releases/<version>/<platform>/`. On macOS it also checks the app's actual Info.plist version. Regular `npm run build:desktop` remains usable without a signing key but such unsigned local builds cannot be published.
3. **Publish without `--apply`** checks the signed package, hashes, frozen notes and AWS identity without uploading.
4. **Publish with `--apply`** takes an S3 publisher lock, refuses downgrades and immutable-file conflicts, uploads versioned files, verifies the public package hash, updates the changelog index, and advances `stable.json` last. A failed partial upload is safe to retry with the **same staged artifact**. Rebuilding produces a different signature/package: use a new version after a package has been published. Do not force overwrite a release.

Use `--profile canopy` with publishing if needed. The scripts require AWS account `533797168831`, not whichever unrelated account may be configured elsewhere. The API identity stays in the AWS CLI credential provider. No AWS credentials go into the game.

The first release is macOS Apple Silicon (`darwin-aarch64`). The build/publisher also recognize Intel macOS, Windows and Linux; build/test each on its platform before advertising it. Additional platforms for the same version can be published from the exact same frozen log; the feed preserves existing platforms. Before serving more than one platform, extend publishing to stage and promote all platform artifacts together. The current single-platform publisher refuses a new version that would remove existing platforms from the feed.

## Signing

The updater private key is stored with mode 0600 at:

```text
~/.config/under-the-canopy/updater.key
```

The public key lives in `src-tauri/tauri.conf.json`. **Back up the private key securely. Do not regenerate it for an existing installation, commit it, log it, or upload it as a release file.** CI can instead provide `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. The desktop launcher discovers the protected local key automatically. Modern Tauri signatures bind both package bytes and app version; the app requires that version binding.

Updater signing and Apple Developer ID signing are separate. macOS currently uses ad-hoc signing and is not notarized. Apple signing/notarization is still needed for smooth public macOS distribution. Existing apps without the updater need a one-time manual installation of an updater-enabled build.

## In-app behavior and verification

The main menu shows a zinc version indicator and **What’s new**. Desktop apps automatically check on entering the menu; the indicator reports **Checking**, **Latest**, **Update available**, or **Check unavailable**. A failed check never claims the app is latest. Clicking the indicator opens update details or retries a failed check. Browser builds show only the installed version. What’s new displays bundled release history as a timeline and works offline. An available update loads validated structured notes from its versioned changelog, with feed text as a fallback. Checking does not download; downloading does not install. Installation requires **Install and restart** from the menu. No update is installed during a match. Errors allow retry; failed signature verification never reaches installation.

Before release, run:

```sh
npm run release:check
npx tsc --noEmit
npx tsc --project scripts/releases/tsconfig.json --noEmit
npx vitest run tests/releases
```

Also test an actual older-to-newer update in a disposable copy of the app: check version and notes, download, install, restart, verify the new version, then check again for the up-to-date state. Keep the app identifier unchanged to preserve settings/save identity. Test each advertised OS/architecture; passing unit tests alone is not proof of native installation.

Verified on 2026-10-05: macOS Apple Silicon **0.1.0 → 0.2.0**, using an updater-enabled disposable app copy. The native UI found the live CloudFront release, downloaded and verified the package, installed it, restarted into 0.2.0, displayed the bundled 0.2.0 notes, and reported up to date on a second check. The installed Info.plist independently confirmed 0.2.0. Eleven release tests cover signature/version tampering, explicit actions, network/download/install failures, duplicate actions, disposal and restart retry. Windows, Linux and Intel macOS have not been built or tested by this verification.

A failed publisher leaves the stable feed unchanged unless the final commit succeeded. If it crashes and leaves `publishing.lock`, inspect that private object's version/time and confirm the publishing process has stopped before deleting only that lock. Never clear locks or remove release folders as a generic retry tactic. Use S3 object versioning for recovery, but use a new, higher app version to deliver a gameplay rollback.

## Hosting

Account `533797168831`, region `eu-west-2`, CloudFormation stack `under-canopy-releases`:

- Base URL: https://d3dte7yaa1v3g8.cloudfront.net
- Update feed: https://d3dte7yaa1v3g8.cloudfront.net/stable.json
- Changelog index: https://d3dte7yaa1v3g8.cloudfront.net/changelog.json
- Health: https://d3dte7yaa1v3g8.cloudfront.net/health.json

`deployment.json` records bucket/distribution identifiers. `stack.yaml` provisions only release hosting; it does not modify EC2, networking, DNS or existing IAM identities. S3 blocks public access; CloudFront reads only the `updates/` prefix using signed origin requests. Public clients have HTTPS GET/HEAD access with CORS. Encryption and versioning are enabled; the bucket is retained on stack removal. Incomplete multipart uploads expire after seven days; published releases are retained. Storage and delivery incur AWS usage charges.

```sh
npm run releases:infra
npm run releases:infra -- --apply
```

Add `--profile canopy` when using a named profile. The first command validates without mutation. The second deploys idempotently, refreshes the static health document and creates an empty changelog index only when absent. Published feeds and release files are preserved.

Storage layout:

```text
updates/stable.json                         → /stable.json
updates/changelog.json                      → /changelog.json
updates/releases/<version>/changelog.json   → /releases/<version>/changelog.json
updates/releases/<version>/<platform>.json
updates/releases/<version>/<package>
updates/releases/<version>/<package>.sig
updates/releases/<version>/media/<sha256>.webp
publishing.lock                             (private; never exposed by CDN)
```

Versioned files use one-year immutable caching. The stable feed and index use a 60-second cache. A successful publication may therefore take up to a minute to appear. No CDN invalidation is necessary for routine releases. Never put private sources, signing keys, logs or credentials under `updates/`.
