# endpoint

`MATCH_HOST` is the public EC2 address. Lobby fetch uses HTTPS and `WebSocketChannel` uses WSS on port 443. Nginx terminates a trusted, automatically renewed IP certificate and forwards over loopback to MatchHost on 8787. There is no plaintext fallback or desktop transport-security exception. See `infrastructure/multiplayer/README.md`.
