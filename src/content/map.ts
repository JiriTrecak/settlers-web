import {missionSchema} from "../shared/scenario/schema";
import type { ContentRegistry } from "./registry";
import { placementSchema, campSchema, type Placement } from "./schema";
import type { UtcMap } from "../shared/map/utcmap";

/** Expansion is pure author data → explicit placements, never a separate simulation constructor. */
export function expandMap(map: UtcMap, registry: ContentRegistry): Placement[] {
  const result = [...map.entities];
  for (const s of map.mission ? [] : map.playerStarts) {
    const setup = registry.rules.startingSetup;
    if (s.setup !== setup.id)
      throw new Error(`Player ${s.player}: unknown setup ${s.setup}`);
    const prefix = `start.player.${s.player}`,
      owner = `player.${s.player}` as const;
    result.push(
      placementSchema.parse({
        id: `${prefix}/main-fort`,
        definition: setup.fort,
        position: { x: s.x, y: s.z },
        rotation: 0,
        owner,
        initialState: { construction: "complete", inventory: setup.inventory },
      }),
    );
    setup.units.forEach((u, i) =>
      result.push(
        placementSchema.parse({
          id: `${prefix}/unit-${String(i + 1).padStart(3, "0")}`,
          definition: u.definition,
          position: { x: s.x + u.offset.x, y: s.z + u.offset.y },
          rotation: 0,
          owner,
        }),
      ),
    );
  }
  return result.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
export function validatePlacements(
  map: UtcMap,
  registry: ContentRegistry,
): void {
  if(map.mission) missionSchema.parse(map.mission);
  const all = expandMap(map, registry),
    ids = new Set<string>();
  for (const raw of all) {
    const p = placementSchema.parse(raw),
      d = registry.get(p.definition),
      state = p.initialState;
    if (p.activation && !map.mission) throw new Error(`${p.id}: scripted spawns require a mission map`);
    if (d.currency)
      throw new Error(`${p.id}: currencies cannot be placed on the ground`);
    if (d.gatheringCapacity && p.owner !== "none")
      throw new Error(`${p.id}: mines must be neutral`);
    if (ids.has(p.id)) throw new Error(`Duplicate placement ${p.id}`);
    ids.add(p.id);
    if (p.position.x >= map.size || p.position.y >= map.size)
      throw new Error(`${p.id}: outside map bounds`);
    if (
      p.owner !== "none" &&
      !map.playerStarts.some((s) => p.owner === `player.${s.player}`)
    )
      throw new Error(`${p.id}: missing owner slot`);
    if (state?.health !== undefined && (!d.body || state.health > d.body.maxHp))
      throw new Error(`${p.id}: invalid initial health`);
    if (state?.amount !== undefined && (!d.yield || state.amount > d.yield))
      throw new Error(`${p.id}: invalid initial yield`);
    if (
      state?.quantity !== undefined &&
      (d.kind !== "item" || state.quantity > d.stackLimit!)
    )
      throw new Error(`${p.id}: invalid loose stack quantity`);
    if (state?.construction && d.kind !== "building")
      throw new Error(`${p.id}: construction on non-building`);
    if (p.appearance?.asset) {
      const asset = registry.asset(p.appearance.asset);
      if (!asset.file)
        throw new Error(`${p.id}: appearance must reference a model`);
      if (d.kind === "resource" && !asset.sceneryAsset)
        throw new Error(`${p.id}: resource appearance needs a scenery asset`);
      if (d.kind !== "resource" && asset.sceneryAsset)
        throw new Error(
          `${p.id}: batched scenery appearance requires a resource`,
        );
    }
    if (d.kind === "building" && !Number.isInteger(p.rotation / 90))
      throw new Error(`${p.id}: buildings rotate in quarter turns`);
    if (state?.inventory) {
      const storage = d.behaviors.storage;
      if (!storage) throw new Error(`${p.id}: no storage`);
      const legal = new Set([
        ...storage.accepts,
        ...(d.behaviors.production?.outputs ?? []).filter(
          (id) => registry.get(id).kind === "item",
        ),
      ]);
      for (const [item, n] of Object.entries(state.inventory))
        if (n && !legal.has(item))
          throw new Error(`${p.id}: cannot store ${item}`);
      if (
        Object.values(state.inventory).reduce((n, x) => n + x, 0) >
        storage.capacity
      )
        throw new Error(`${p.id}: initial inventory exceeds capacity`);
    }
  }
  const members = new Set<string>(),
    campIds = new Set<string>();
  let legendaryRewards = 0;
  for (const raw of map.camps) {
    const camp = campSchema.parse(raw);
    if (camp.lootPool && !registry.rules.lootPools[camp.lootPool])
      throw new Error(`${camp.id}: unknown loot pool ${camp.lootPool}`);
    for (const id of camp.fixedDrops ?? []) {
      const item = registry.get(id);
      if (item.kind !== 'item') throw new Error(`${camp.id}: fixed drop must be an item: ${id}`);
      if (item.itemTier === 3) {
        if (!camp.legendary) throw new Error(`${camp.id}: T3 loot requires a legendary camp`);
        if (++legendaryRewards > 3) throw new Error("Maps may award at most three legendary items from camps");
      }
    }
    const pool = camp.lootPool && registry.rules.lootPools[camp.lootPool];
    if(pool && pool.entries.some(e => e.item && registry.get(e.item).itemTier === 3)) {
      if(!camp.legendary) throw new Error(`${camp.id}: T3 loot requires a legendary camp`);
      legendaryRewards += pool.rolls;
      if(legendaryRewards > 3) throw new Error("Maps may award at most three legendary items from camps");
    }
    if (campIds.has(camp.id)) throw new Error("Duplicate camp ID");
    campIds.add(camp.id);
    for (const id of camp.members) {
      const p = all.find((p) => p.id === id);
      if (
        !p ||
        p.owner !== "none" ||
        !registry.get(p.definition).behaviors.campDefense ||
        members.has(id)
      )
        throw new Error(`${camp.id}: invalid/duplicate camp member ${id}`);
      members.add(id);
    }
  }
  for (const p of all)
    if (registry.get(p.definition).behaviors.campDefense && !members.has(p.id))
      throw new Error(`${p.id}: camp defense requires an authored camp`);
  for (const s of map.mission ? [] : map.playerStarts) {
    const p = all.find((p) => p.id === s.mainFort);
    if (
      !p ||
      p.owner !== `player.${s.player}` ||
      registry.get(p.definition).kind !== "building"
    )
      throw new Error(`Player ${s.player}: invalid main fort objective`);
  }
}

/** Physical occupancy is an authoring/Play boundary check, separate from reference graph drafts. */
export function placementOccupancyError(
  map: UtcMap,
  registry: ContentRegistry,
): string | null {
  const occupied = new Map<number, string>();
  for (const p of expandMap(map, registry)) {
    const d = registry.get(p.definition);
    if (
      d.kind === "item" ||
      (d.kind === "resource" && p.initialState?.amount === 0)
    )
      continue;
    const swap = Math.round(p.rotation / 90) % 2 !== 0,
      w = d.footprint ? (swap ? d.footprint.depth : d.footprint.width) : 1,
      h = d.footprint ? (swap ? d.footprint.width : d.footprint.depth) : 1;
    for (
      let y = p.position.y - Math.floor(h / 2);
      y <= p.position.y + Math.floor(h / 2);
      y++
    )
      for (
        let x = p.position.x - Math.floor(w / 2);
        x <= p.position.x + Math.floor(w / 2);
        x++
      ) {
        if (x < 0 || x >= map.size || y < 0 || y >= map.size)
          return `${p.id}: footprint is outside the playable map`;
        const cell = y * map.size + x,
          other = occupied.get(cell);
        if (other) return `${p.id}: overlaps ${other}`;
        occupied.set(cell, p.id);
      }
  }
  return null;
}
