# Shared release notes

For completed changes that affect players or editor users, maintain `releases/log.json` through `npm run release:note -- --kind added|improved|fixed|knownIssues --text "Concise user-facing change"`. Every agent uses this same log; do not create separate changelogs. Preserve other agents' entries and do not invent changes or test results. Internal-only refactors need no note.

For release preparation, publishing, or updater work, read [the release skill](docs/skills/release-canopy/SKILL.md) and follow [the release workflow](infrastructure/releases/README.md). Do not freeze or publish a release without user intent to release; ordinary bug-fix authorization only requires maintaining Unreleased.

Routine releases use patch versions. Reserve `0.X.0` for agreed major upgrades (for example, a new race), `0.7.0` for planned public early access, and `1.0.0` for full release. Minor/major preparation requires `--milestone`; do not choose milestones without user intent.
