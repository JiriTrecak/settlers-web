# Shared release notes

For completed changes that affect players or editor users, maintain `releases/log.json` through `npm run release:note -- --kind added|improved|fixed|knownIssues --text "Concise user-facing change"`. Every agent uses this same log; do not create separate changelogs. Preserve other agents' entries and do not invent changes or test results. Internal-only refactors need no note.

For release preparation, publishing, or updater work, read [the release skill](docs/skills/release-canopy/SKILL.md) and follow [the release workflow](infrastructure/releases/README.md). Do not freeze or publish a release without user intent to release; ordinary bug-fix authorization only requires maintaining Unreleased.

Routine releases use patch versions. Reserve `0.X.0` for agreed major upgrades (for example, a new race), `0.7.0` for planned public early access, and `1.0.0` for full release. Minor/major preparation requires `--milestone`; do not choose milestones without user intent.

# Visual preview preference

Use neutral zinc / dark gray backgrounds, ground planes, and controls for model previews and review benches. Avoid green or olive preview stages: they obscure silhouettes and team colors. Defaults: background `#18181b`, ground/panels `#27272a`, controls/borders `#52525b`. Keep authored unit colors intact. Use an actual terrain backdrop only when needed to verify in-game appearance or explicitly requested.

# Unit readability requirement

For every unit created or refined, verify the actual runtime model at normal game zoom from the overhead game camera and directly above. Each unit needs a distinct silhouette and a prominent defining feature that remains identifiable from above and in groups. Verify ownership surfaces in every supported player color, including white and dark colors, from front and back. Prioritize broad readable forms and clear team-color areas over small detail. Redesign armor, headgear, weapons, or other defining forms when a unit is difficult to distinguish; do not accept a model based only on close-up views.

# Unit scale hierarchy

Use regular infantry such as Warrior as the 1× visual baseline. Heroes and large T3 units should generally target 2× that scale, with matching declared selection/body dimensions and formation spacing. Marshal explicitly uses 2× Warrior scale. Hero geometry may use up to 10,000 triangles; retain broad overhead silhouettes and clear team-color areas instead of adding visual noise.
