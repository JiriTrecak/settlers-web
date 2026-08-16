# maps

`GET /maps/catalog.json` and `GET /maps/<file>` where `file` is a dumped JSON path (`tutorial/T1.json`).

Validates with `isDumpedMap`. Unknown / corrupt dump throws; `Session` falls back to the first generated map.
