# resource

Per-tile underground deposit: coal / iron / gold / gems / brimstone / fish. Amount 0–50. Original map cells pack type in the high nibble and amount 0–15 in the low; ingest scales `round(nibble * 127/15)` then clamps to 50. Amount 0 or an unknown type is empty. Fish never becomes a land sign.

`MapGrid` stores parallel `resourceType` / `resourceAmount` arrays. Dumps list only non-empty tiles (`resources?: { x, y, type, amount }[]`); older JSON omits the field. Mines `takeResource` 1 from a random blocked tile of the matching kind.
