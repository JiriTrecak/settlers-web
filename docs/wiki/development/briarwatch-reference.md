# The Defense of Briarwatch

A playable ant adaptation of Warcraft III's first Human chapter, **The Defense of Strahnbrad**. It is a separate reference mission for evaluating army control, encounters, exploration and cinematic pacing. The existing Vanguard chapters remain available.

Launch **Campaign → Vanguard → Reference — The Defense of Briarwatch**, or use `?map=vanguard-briarwatch` on the game URL.

## Mission structure

Start with the Marshal and four Warriors, capped at hero level 2. Follow the forest road south through a hamlet, then east toward the stream and north into Briarwatch. There is no economy or base construction.

Two volunteers can join your squad. Explore the eastern spur to rescue a youngling and escort him home for an armor ring. Survive a traveler's betrayal, then help a robbed merchant: defeat the thieves, physically recover his leaf ledger and bring it back for a vigor seed. The seed permanently adds 25 health and 1 damage without occupying inventory space.

Cross the bridge, save surviving town defenders, search the cottages and defeat the Briar Captain with his escorts. Losing the Marshal fails the mission; optional rescues may fail without ending the main story. Supplies hidden in breakable crates reward exploration.

## Authoring and checks

The source recipe and original dialogue are in `scripts/missions/vanguard-briarwatch.ts` and its adjacent `.lua`. The chapter demonstrates inventory exchanges, civilian transformation, cross-owner escorts, deterministic fixed rewards and scripted destruction through the ordinary combat system. See [Mission scripting & Lua](./mission-scripting).

Six village/prop models, four animated ant variants and six ground-item models are backed by editable Blender sources. Six new inventory icons publish at exactly 128×128 through Asset Studio's image processor. Asset studios use ports 8920 (village), 8921 (cast), and 8922 (rewards).

The repeatable playthrough driver is `scripts/qa/briarwatch-playthrough.ts`; add `--optional` for the rescue and ledger branches. It uses actual movement, combat and item commands and compares snapshots after loading. Detailed route evidence and animation checks are stored under `artifacts/briarwatch`.

## What the comparison means

The reference matches the mission's major encounter and quest structure. It uses our ant army, four-slot inventory, Marshal abilities and current balance. Dialogue and art are original. It is a gameplay reference to improve through playtesting, not a claim of equal polish to the shipped Warcraft campaign.

Research: [Gamepressure route map](https://www.gamepressure.com/warcraft-iii-reforged/the-defense-of-strahnbrad/z1cfa7), [Blizzplanet encounter walkthrough](https://warcraft.blizzplanet.com/blog/comments/the-defense-of-strahnbrad-warcraft-iii-reforged), and [Gamer Walkthroughs rewards and secrets](https://gamerwalkthroughs.com/warcraft-3-reign-of-chaos/human-campaign-the-scourge-of-lordaeron/the-defense-of-strahnbrad/).
