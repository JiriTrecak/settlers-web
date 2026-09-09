# Map weather

The Environment panel offers Clear, Rain and Snow, plus intensity and horizontal wind. These values are stored in `landscape.environment.weather` in the map JSON. Omission means clear weather. Changing an environment setting preserves the live preview hour unless the edit explicitly sets a new hour.

The strict weather schema accepts `kind` (`clear`, `rain`, `snow`), `intensity` (0–1), `windX` and `windZ` (−10–10). Wind uses world axes, in world units per second. Weather is cosmetic: it does not change gathering, combat, movement, navigation or deterministic simulation state. Snowfall does not yet accumulate on terrain or change tree materials.

`WeatherLayer` renders at most 768 particles in one camera-local instanced batch. Clear weather hides the batch and skips particle updates. Rain uses short narrow streaks; snow uses camera-facing flakes. The layer shares normal terrain depth testing and the game's fog material integration. Editor and gameplay use the same renderer. Existing authored maps remain clear.

Validation: rain and snow previewed in the editor, then switched back to Clear; no preview changes were saved to the shipped map. Schema/range validation, camera bounds, batch counts, precipitation switching and no updates in clear mode are tested. The complete checkpoint passes 266 tests in 77 files and the production build.
