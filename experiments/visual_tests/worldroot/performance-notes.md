# Worldroot renderer measurements — 2026-09-10

Reference-stage bridge view: Worldroot Hollow, x110 z123 zoom1, soft shadows, 2326×2408 canvas at DPR2. This is the authored scene fixture, not an active AI match. Values read from the visible built-in profiler; short samples are noisy and are not a controlled benchmark.

Before tightening projected grass detail: 100.7 FPS, GPU mean7.04ms/p9512.54ms; 5,127,383 triangles across passes, grass1,662,748 triangles, 1200 draw calls.

After tightening detail: 88.9 FPS, GPU mean8.52ms/p9515.79ms; 3,161,860 triangles across passes, grass902,008 triangles,1199 draw calls. Geometry is lower, but these samples do **not** demonstrate a frame-rate improvement. CPU settlement update mean6.90ms and submission3.68ms remain material costs. Continue profiling and compare at persistent half resolution before claiming a performance target.

Cover63575 instances in757 batches,3636 props. The full map is intentionally loaded; spatial batches cull drawing. Foliage rebuild about2.2s is an event cost and still worth reducing. No frame-rate completion claim yet.
