# lockstep

One slot's outbox. `send` queues a click. `confirm(through, bundleTick?)` ships `turn { through, bundles: [{ tick: bundleTick ?? through+D, actions }] }` (empty bundle omitted). Duplicate empty `through` is not sent. `take(next)` pops the Room's commit for that beat.
