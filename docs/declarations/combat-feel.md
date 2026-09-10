# Combat feel: active implementation pass

## Outcome and acceptance

Orders must respond immediately in presentation and promptly in authoritative simulation. Units should travel naturally in groups and maintain useful approaches to moving opponents. Weapon damage, release and contact must correspond to the visible animation. Validate mixed armies, tight passages, chases, retreat, repeated orders, fog transitions, low FPS and multiplayer replay determinism. Passing isolated tests alone is not completion.

## Confirmed starting defects

- `Combat.resolve` applies ordinary melee/ranged damage immediately when cooldown is zero. `SettlementLayer` then sees an increased cooldown and starts the attack animation. Contact is consequently late by the animation's windup.
- `ProjectileEffects` renders arrows after damage has already been applied, with a cosmetic flight duration unrelated to simulation.
- Chasing only refreshes a route when it is empty, so moving enemies leave attackers chasing obsolete positions. Route retries are 20 ticks (500 ms).
- `Combat.plan` stops a unit when the target is in range, before movement runs; `resolve` checks range again after the target moved. Slight movement can therefore deny the strike before a windup even exists.
- Move groups receive a fixed four-column destination layout based on actor enumeration, with no assignment based on current positions. This creates avoidable crossing and detours.
- Rendering uses a fixed 0.35 positional lerp rather than sampling authoritative positions on a frame-rate-independent clock.
- Hit reactions can interrupt attack animation. Cooldown deltas are an unreliable attack event stream during frame skips.

## Design direction

One authoritative attack cycle should own start, contact/release, and recovery timestamps. Cooldown is the interval between starts, not a signal to infer animation. Animation samples that cycle using the asset's authored contact fraction. Damage cannot be caused by render callbacks.

A valid attack starts within normal weapon range. Small target motion during windup receives bounded range tolerance; it should not require an exact second range equality. Genuine escape, target death, explicit cancel, stun and invalid targets remain meaningful. Movement can cancel recovery after release without undoing a hit or bypassing weapon cooldown. A new pre-release order cancels the strike. Ordinary projectiles need authoritative launch and impact state; launched projectiles can survive shooter death. Area shells remain dodgeable at their committed ground position.

Global navigation handles static terrain. Moving units require local avoidance and destination allocation, not just repeated A* searches treating every moving body as permanent terrain. Chase replanning must notice a moving destination before reaching an obsolete endpoint, and must be bounded to avoid pathfinding spikes.

## Research status

Primary developer reference located: [AI Navigation: It's Not a Solved Problem — Yet](https://www.gdcvault.com/play/1014514/AI-Navigation-It-s-Not), GDC 2011, including Blizzard's James Anhalt. The public page establishes authorship but does not expose the talk transcript; detailed algorithms are not yet verified from it.

[AI Arena's SC2 compatibility patch](https://github.com/aiarena/sc2patch) is a primary implementation artifact for its own mod, not Blizzard's source or a guarantee of current ladder behavior. Inspect actual weapon data before citing specific timing values.

Community discussions suggest Warcraft's damage-point/backswing/range-motion-buffer and StarCraft's range-slop distinctions. Treat these as leads to verify against authored game data or developer documentation, not as authoritative exact engine semantics. The rules above are our design decisions, not a claim of an exact Warcraft clone.

## Remaining work

- Authoritative attack lifecycle and explicit presentation phase.
- Authoritative projectile impact and visual synchronization.
- Responsive pursuit, collision/steering and formation assignment.
- Input latency and renderer interpolation audit.
- Repeatable movement/combat benchmark scenes and visual checks.
- Regression, replay determinism, CPU budget and completion audit.
