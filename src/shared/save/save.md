# save

`SAVE_FORMAT_VERSION` is the JSON schema. Bump it when the blob changes; `parseSaveFile` returns null and the file will not load.

A save is a **World snapshot** plus the lockstep **pipeline** plus the full **action log**. Load restores the snapshot (no re-sim). The log is enough to export a replay afterwards. `remote` stamps the mode: `false` = singleplayer, `true` = multiplayer. Load lists only show matching files.
