# save

Match save/load. File is `SAVE_FORMAT_VERSION` + World snapshot + action log + lockstep pipeline + `MatchConfig` (slot names). Bump the version when the blob changes — old files will not load.

Load restores the snapshot (no re-sim). `saveToReplay` shelves the log as a replay without ticking. Same JSON for SP and MP; `remote` is the mode stamp (`false` SP / `true` MP) so the load list only offers the matching kind. Slot `name`s and `match.delay` ride along. Pipeline is the Room/Lockstep mailbox so D-ahead commits survive.
