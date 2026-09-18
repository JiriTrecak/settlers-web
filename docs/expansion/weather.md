# Map weather

The Environment panel offers Clear, Rain, Snow and Drifting spores, plus intensity and horizontal wind. These values are stored in `landscape.environment.weather` in the map JSON. Omission means clear weather. Changing an environment setting preserves the live preview hour unless the edit explicitly sets a new hour.

The strict weather schema accepts `kind` (`clear`, `rain`, `snow`, `spores`), `intensity` (0–1), `windX` and `windZ` (−10–10). Wind uses world axes, in world units per second. Weather is cosmetic: it does not change gathering, combat, movement, navigation or deterministic simulation state. Snowfall does not yet accumulate on terrain or change tree materials.

`WeatherLayer` renders at most 768 particles in one camera-local instanced batch. Clear weather hides the batch and skips particle updates. Rain uses short narrow streaks; snow uses camera-facing flakes. Spores use soft round billboards, rise slowly at 0.18 metres/second and wander horizontally within a 1–7 metre band above terrain or water. Spore wind controls use 0.01-metre/second increments. The layer shares normal terrain depth testing and the game's fog material integration. Editor and gameplay use the same renderer. Maps that omit weather remain clear. The Heartwood Vault declares spores at half intensity (384 particles).

Validation: rain and snow previewed in the editor, then switched back to Clear; no preview changes were saved to the shipped map. Schema/range validation, camera bounds, batch counts, precipitation switching and no updates in clear mode are tested. See the [canopy validation record](./canopy-goal-validation.md) for the current regression and build results.

## Mist and sunlight shafts

Maps can also author [volumetric atmosphere](./volumetric-atmosphere.md). Its density field follows weather wind, while rain reduces shaft intensity. It has separate graphics quality settings and remains cosmetic.


Spore validation covers map roundtripping, bounded particle count, clearance above water, slow motion, repeatable visual positions for the same timestamp and disabling the batch. The current scene was checked in the game renderer and editor, including fractional wind values. Ground paint renders before water, and weather after it, while normal depth testing still hides particles behind solid geometry.
