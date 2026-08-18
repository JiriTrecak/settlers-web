# rng

Injected, seeded. Same seed ⇒ same float/int stream. `state()` is the mulberry word for checksums — not a game value. Tests monkey-patch `Math.random` to prove we never call it.
