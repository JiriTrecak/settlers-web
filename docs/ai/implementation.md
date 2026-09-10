# Opponent AI implementation

Implemented 9 September 2026. This document describes the running replacement. [The design](README.md), [architecture rationale](architecture.md), and [adversarial review](adversarial-review.md) retain the longer-term intent and playtesting questions. There is one policy, one planner, and no old-planner fallback.

## Entry points and authority

`World` owns one `PlayerAI` for each `kind: "ai"` slot. After applying commands and completing a simulation tick, it supplies that player's observation to the brain. The brain returns ordinary `Action` objects with unique increasing sequence numbers. They enter the existing queue for the following tick. `Game.command()` remains authoritative for ownership, money, workers, placement, casting, and targets. Every lockstep peer generates the same AI commands; they are not additionally broadcast as host-issued player inputs.

The brain imports content, observation DTOs, public map knowledge, and action types. It has no `Game`, `GameContext`, live `Spatial`, renderer, DOM, or private entity-store reference. The old `Game.planAI()` method and fixed build-order configuration were removed.

Code responsibilities:

- `src/sim/ai/briefing.ts`: compile and freeze authorized initial geography, possible starts, public camp expectations, and resource sites. Never receives the running simulation.
- `frame.ts`: strip private enemy data, index the current owner observation, estimate strength, check public terrain connectivity and locally observed placement space.
- `state.ts`: strict serializable brain state; missions, squads, scout, guard assignments, camp beliefs, sightings, worker returns, pending commands, retry deadlines, and bounded diagnostics.
- `playerAI.ts`: knowledge updates, strategic objectives, army operations, command arbitration, receipts, save/restore, and explanations.
- `economy.ts`: growth, worker reservations, funding, recruitment, recurring population capacity, gathering recovery, forestry, and sanctuary construction/revival.
- `tactics.ts`: eligible skill choices, items, visible-target spell scoring, worker evacuation, wounded-unit retreat, bounded pursuit, and limited archer spacing.
- `src/content/spellArea.ts`: shared line/blast hit geometry used by both authoritative spell resolution and AI scoring.

## Knowledge and fog

The frozen briefing exposes initial terrain heights/water connectivity, possible starting sites without player assignments, camp centers and nominal composition, and resource locations. It contains no runtime entity IDs, bank balances, owner production, live camp survival, or loot results. Maps can mark a placement or camp with optional `mapKnowledge: "hidden"`; it then stays out of that public briefing.

Dynamic inputs use the same owner-filtered observation as the game. Own workers expose structured orders, employment, jobs, pending movement, release, stun, and cargo state. The AI does not parse human-readable status text. Enemy orders, cargo, exact cooldowns, inventory and effects are stripped from the AI projection. Allied buildings are excluded using the match's public teams. Passive neutrals are not treated as targets.

Camp states are `expected`, `active`, `empty`, and `cleared`. Unseen removals do not update them. An inspected empty area produces an `empty` belief with a retry delay, since defenders could have been pulled away. Previously observed defender IDs plus witnessed deaths can establish a completed clear. Confirmed clears do not become available merely because memory ages; a directly observed new defender can establish activity again.

The observation layer retains a bounded ten-second list of visible death reports in saved knowledge. This closes the save-between-reviews gap: a witnessed kill is not lost merely because presentation-only death animations are not restored. Mobile sightings remain at their last observed location and expire after twenty seconds. Recent hostile sightings add risk to nearby camp choices; they do not track hidden movement.

Current limitation: camp affiliation is inferred from defenders seen within the camp area and its nominal member count. Overlapping or heavily displaced camps may remain uncertain rather than receive a confirmed clear. The AI never reads `clearedCamps` to resolve that uncertainty.

## Scheduling and arbitration

The simulation runs at 40 ticks per second. Defaults in `content/game.json` → `rules.ai`:

- Decision beat: 10 ticks. Multiple AI slots have deterministic staggered phases, distributing their work over simulation ticks.
- Economy: 80 ticks; strategic review: 200 ticks; army operation update: 40 ticks.
- New-contact reaction delay: 20 ticks for deliberate combat retargeting; emergency movement uses observed health and local threats.
- At most four emitted commands per decision, one spending command, and one command per actor. Group commands exclude actors already claimed by a higher-priority action.
- Hero management runs first, then the due economic review, tactical reactions, and army operations. This preserves economic time during sustained fighting.
- Placement examines at most 24 candidate sites per review. Spell scoring examines at most 16 visible aim candidates per ability. Doorway reachability uses a local flood capped at 4,096 cells.

Continuing engine actions are not repeatedly reissued. Orders remember their target, signature, position and progress tick. Paths keep running until their objective changes or progress stalls. Operation membership persists while new recruits join, preventing an endless assembly loop. A scout can locate the opponent while the Marshal's main group clears camps.

A submitted command stays pending until its correlated receipt. Rejected builds back off that candidate for thirty seconds; rejected requests have a four-second retry delay. The planner branches on acceptance and observed results, never on display-message text. Detailed typed rejection reason codes remain a future improvement to the shared command API; the AI currently records acceptance/rejection and its own intent reason.

## Economic behavior

All prices and recipe semantics come from target definitions. Build permissions and building roles come from capabilities. Artwork, names and command-card positions do not determine behavior.

The initial workforce target is 16, growing with army investment toward 28. The productive floor is six workers, with up to two free workers reserved for building or recruitment. A near-destroyed economy reduces that reserve so its last worker can still gather. Existing startup gathering is retained. Available workers are assigned toward the less-served resource, taking the bank balance into account. Full ten-slot mines are excluded, including reservations held by workers carrying home. Exhausted assignments can move to observed replacement sources.

The hall contributes eight living-worker capacity and a 12-second birth interval; houses add three capacity each and a 20-second interval. The planner counts completed and planned capacity, so it does not endlessly add houses while construction is pending. Recruitment accounts for real worker conversion, current training and queued promises. Queues stay shallow, reserve the unfunded portion of their bills, and shed unstarted tails after workforce losses. Current army targets grow with workforce and observed pressure, up to the declared cap. The warrior/archer preference is 60/40, adjusted within bounds for visible enemy range and armor matchups.

Construction respects explored land, footprints, elevation, resource clearances, building access lanes, entrances and local reachability. The normal command validator still decides final legality. A sanctuary is prepared once military investment justifies it, or when a hero is fallen. A forester is useful when nearby timber becomes scarce. Extra barracks require actual queue saturation.

The AI uses current gameplay exactly: workers carry resources home; houses replenish workers under their shared capacity; the hall does not shoot; revival is free because it is free for everyone. It does not add a new expansion building or quietly authorize constructing the free setup hall. Remote drop-off expansion is still gated on a separately designed, buildable drop-off with a real cost. Travel-cost economics and multi-base allocation will need another pass when that building exists.

## Hero and army behavior

The strategic plan records the next hero XP threshold and the army/economic target. Feasible camps compete on travel distance, expected resistance, useful XP, uncertainty, and recent threat evidence. The hero spends available points on eligible ranks, prioritizing the single-rank ultimate when its required level is reached. Levels, mana, cooldowns, costs and skill requirements remain content-owned.

The main force assembles, travels, engages and can regroup. It targets observed or remembered enemy buildings once ready; a remembered building is approached with a movement order until visible. Current exposed halls receive explicit attack orders. Reinforcements join the active group, a small guard remains near home once there is a larger army, and a lone distant contact does not automatically recall the whole force. Visible major threats or a damaged hall in danger can trigger a full response.

Wounded units can withdraw; threatened workers remember their old harvesting target and return when safe. Pursuit is restricted to the current operation area or home defense. Archers make limited space after shooting rather than receiving perfect frame-by-frame kiting. In-place basic auto-attack/pathfinding remains the shared unit system.

The Marshal scores visible line/blast footprints, avoids redundant buffs, uses healing when it would meaningfully help, picks up nearby loot, and can replace a weaker inventory item. Death preserves its existing identity, inventory and progression; the AI queues that same hero at a sanctuary and brings it back into operations. It does not suicide for free healing. It cannot heal ordinary soldiers or buy a new hero when no such game command exists.

## Determinism, diagnostics and verification

World snapshots are version 2 and the simulation build is `declarative-sim-12`. Content policy, match slots, map identity, brain state, observations and queued actions participate in save validation/checksums. Brain saves are validated before applying a world restore, including pending-command correlation. Incompatible old saves are rejected; there is no compatibility branch. Policy choices depend on ticks, sorted IDs, content and observed state; wall-clock timings are diagnostic only.

F3 shows each AI's decision timing, mission, economic state, current reason, and accepted/rejected command counts. Timing samples include the owner observation required for a decision. Each brain retains its last 80 intention records, available through `World.aiSummary()` / snapshots. This is an initial explanation surface; a clickable map of scored alternatives is not implemented.

Run the reproducible headless harness:

```sh
node --import tsx scripts/ai/match.ts assets/maps/showcase/mosswater-divide.utcmap 24000 duel experiments/ai/mosswater-duel.json
node --import tsx scripts/ai/match.ts assets/maps/skirmish/amberfall-wilds.utcmap 20000 duel experiments/ai/amberfall-duel.json
```

The harness reports investments, skill/loot use, hero levels, outcome, and CPU percentiles for actual decision beats. `passive` instead of `duel` supplies a stationary human-controlled opponent. Results are written to the specified JSON report. These are simulation tests, not a claim of human playtesting or a fixed match length.

The economy cutover passed **325 tests across 90 files**, including AI, spell and lockstep checks. TypeScript and the production build pass.

Automated coverage lives in `tests/ai/player-ai.test.ts` and the existing lockstep, observation, economy, inventory, spell and revival suites. It covers hidden camp changes, inspected emptiness, enemy-private-field removal, command budgets, arbitrary-tick save continuation, healing/skills, resurrection, worker evacuation, a broke one-worker economy, noncombat targets, saved death reports, and eight-slot save continuity. The wider adversarial scenario list remains a playtesting backlog, not a list of scenarios all proven by unit tests.

Before the economy cutover, the final Mosswater passive-opponent run ended in a hall kill at tick 5,094 (about 2:07) with a level-4 Marshal, 14 recruitment commands, eight casts, four pickups, and no rejected commands; an Amberfall two-AI run ended in a hall kill with level-7 and level-8 Marshals. The live Mosswater browser check reported about 120 FPS and roughly 1.2 ms p95 for one AI decision in that view. Headless decision timings were higher on the large two-AI map. These are observations on this machine, not a universal 120 FPS or sub-1-ms guarantee. Report files capture individual tuning runs; balance and human exploit testing should continue from actual matches.

## Skirmish lobby and observation

The main menu opens `SkirmishScreen` for local matches; Campaign is reserved and disabled.
`shared/match/skirmish.ts` owns transport-independent lobby data (`MatchSetup`) and validates
it into the existing frozen `MatchConfig`. Every authored start participates. One local
human can take any start; selecting another human seat transfers control. All-AI rosters
launch a read-only observer (`SessionConfig.player = null`). Map player numbers are one-based;
match slots are zero-based. The chosen slot determines camera home, commands, HUD ownership,
fog and team color. The observer uses an existing empty local transport mailbox for lockstep,
never as player authority. Session rejects observer input before enqueueing, and the HUD
projects selection, inventory and production queues without actionable commands.

Map previews are 512px Canvas2D atlases generated from authored height, water, cover,
terrain strokes, trees, amber seams, camps and starts. No simulation or second WebGL
context is created for previews. Optional map `description` is validated (at most 1200
characters) and round-trips through `.utcmap` serialization. Missing descriptions have a
lobby fallback. Lobby map IDs, participant slots and the preview renderer are reusable by
a future multiplayer lobby; this change does not alter the network-room protocol.

### Debug controls (F3)

- **Reveal map (visual only):** local presentation reads the omniscient projection and
  substitutes an all-visible fog texture. It never edits exploration, observation memories,
  camp knowledge, or simulation entities. Human commands/HUD still consume the actual owning
  player's observation. AI always consumes its existing owner-limited view.
- **Fog perspective:** with reveal off, view any participant's current and explored terrain.
  Observer selection follows that view; this does not change who controls a human match.
- **Match speed 1× / 2× / 3× / 4×:** scales accumulated wall time, retaining 25ms deterministic
  simulation ticks and ordinary local commits. Character animation and environment time use
  the same multiplier; camera input remains at normal speed. A bounded catch-up budget avoids
  freezing after a long stall. Rates are requested targets, limited by available CPU time.
- AI-only observation starts with reveal on, speed 1×. Debug settings are session-local, are
  not simulation/save data, and can be reversed. The profiler's existing F3 visibility preference
  remains persistent. Network matches retain synchronized 1× timing and player visibility.

Tests cover P2 ownership and starts, zero-human matches, roster validation, observer command
rejection and save restoration, visual fog restoration, unchanged AI knowledge/checksums,
and equivalent simulation results at all four speeds.

After the amber/wood cutover, a 16,000-tick Mosswater duel kept both economies producing, expanding capacity and recruiting: each finished with 23 workers; Player 1 had 17 warriors and 10 archers, Player 2 had 16 warriors and 9 archers. No outcome had occurred yet. This is a liveness smoke test, not a balance verdict.
