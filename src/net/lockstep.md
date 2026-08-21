# lockstep

One slot's outbox. `send` queues a click. `confirm(through, bundleTick?)` ships `turn { through, bundles: [{ tick: bundleTick ?? through+1, actions }] }` (empty bundle omitted). Duplicate empty `through` is not sent. `take(next)` pops the Room's commit for that beat. `delay` only pushes empty `through` ahead of display so the Room can commit in realtime.
