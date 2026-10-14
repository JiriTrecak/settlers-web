# server

MatchHost process. Internal HTTP `/api` + WS `/match/:id` on `127.0.0.1:8787`, exposed only through Nginx HTTPS/WSS on 443. Imports networking, shared protocol code, and content validation schemas (Zod). Deploy with `npm run server:deploy`; systemd enables startup on boot and restarts on failure. TLS setup and renewal are documented in `infrastructure/multiplayer/README.md`.

A one-second maintenance pulse drives bounded connection probes. The timer is unreferenced and cleared when the server closes. Restart the deployed process with this code to enable measured match input buffers.
