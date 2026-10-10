# Water interaction check

With `npm run dev`, open `/scripts/bench/water-interaction/index.html?units=16` for a small crossing, or `?units=1000` for the bounded crowd stress case. `&debug=true` displays signed slopes and ring coverage in the interaction target. Rust dots represent moving units; this uses the production HeightMesh and ImportedWater renderer, not a parallel water implementation.

The page reports shader links, WebGL errors, bounded ring count, CPU emitter/upload p95 and GPU ripple-pass p95 (when timer queries are available). The extra measurement target repeats only the interaction pass for attribution; it is not used in production. Timings are local-browser measurements, not full-match performance guarantees. Close other rendering tabs and keep the tab active for comparable results. Shadow lighting matches gameplay so sampler validation is exercised.
