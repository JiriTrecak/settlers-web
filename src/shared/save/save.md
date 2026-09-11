# Save envelopes

`SAVE_FORMAT_VERSION` is 3. The host parser treats the World blob as opaque; `World.restore` and `Game.restore` validate it. `pipelineSchema` describes committed progress, each participant's confirmations, room-held actions, unapplied commits and the local send frontier.

Singleplayer's `shared/save/localSave.ts` adds map/content revision, seed and every local client's unsent outbox. Save/Load use this current format; incompatible map/content/build state is rejected. Restore resumes the snapshot and mailbox directly. There is no old-format converter and no persisted full action-log/replay UI.

The multiplayer host retains its own envelope for transport restoration. Local Save/Load buttons are only exposed for singleplayer. See [determinism tests](../../../docs/declarations/validation.md).

Local format version 4 stores campaign/skirmish mode, nullable viewing player, and the complete frozen match config. IndexedDB stores named saves; imported files receive the same mode, revision, world and pipeline checks. The F10 menu pauses local transport before taking a snapshot. Restart retains the frozen config and discards simulation progress.
