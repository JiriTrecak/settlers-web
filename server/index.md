# server

MatchHost process. HTTP `/api` + WS `/match/:id` on `0.0.0.0:8787`. Imports networking, shared protocol code, and content validation schemas (Zod). Deploy with `npm run server:deploy`; systemd enables startup on boot and restarts on failure.
