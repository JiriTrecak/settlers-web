# lockstep

One slot's outbox. `send` queues a click. `confirm(next)` ships `turn { through: next, bundles: [{ tick: next+D, actions }] }` (empty bundle omitted; empty confirm still goes). `take(next)` pops the Room's commit for that beat.
