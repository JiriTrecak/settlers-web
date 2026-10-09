import {raceDefinition} from './races';
import {startingUnits,startingUnitPosition} from './startingHero';
import type {Slot} from '../shared/match/match';
import {placementGeometryError} from '../shared/spatial/placement';
import {footprintCellBounds,navigationBodyOverlapsBounds} from '../shared/spatial/footprint';
import {resourceCenterSeparation} from '../shared/map/resourceClearance';
import {missionSchema} from "../shared/scenario/schema";
import {projectScene} from '../shared/authoring/project';
import type { ContentRegistry } from "./registry";
import { placementSchema, campSchema, type Placement } from "./schema";
import type { UtcMap } from "../shared/map/utcmap";
import {HeightField,decodeHeight} from '../shared/map/height';
import {bridgeSurfaces,surfaceHeight} from '../shared/map/bridgeSurface';

function placementFloors(map:UtcMap){
 const compiled=projectScene(map),field=compiled?.field??new HeightField(map.size);if(!compiled&&map.height)field.load(decodeHeight(map.height,map.size)??[],map.waterLevel??0,map.landscape?.importedTerrain);
 const decks=new Map(bridgeSurfaces(compiled?.stamps??map.stamps,(x,z)=>field.sample(x,z)).map(d=>[d.id,d]));
 return (p:Placement['position'])=>{
  if(!p.surface)return field.sample(p.x,p.y);
  const deck=decks.get(p.surface);return deck?surfaceHeight(deck,p.x,p.y):undefined;
 };
}

/** Expansion is pure author data → explicit placements, never a separate simulation constructor. */
export function expandMap(map: UtcMap, registry: ContentRegistry, slots: readonly Slot[] = []): Placement[] {
  for(const slot of slots)raceDefinition(registry.rules,slot.race);
  const result = [...map.entities,...(projectScene(map)?.resources??[])];
  for (const s of map.mission || map.sandbox ? [] : map.playerStarts) {
    const setup = raceDefinition(registry.rules,slots.find(slot=>slot.player===s.player-1)?.race).startingSetup;
    if (s.setup !== registry.rules.startingSetup.id && !Object.values(registry.rules.races).some(r=>r.startingSetup?.id===s.setup))
      throw new Error(`Player ${s.player}: unknown setup ${s.setup}`);
    const prefix = `start.player.${s.player}`,
      owner = `player.${s.player}` as const;
    result.push(
      placementSchema.parse({
        id: `${prefix}/main-fort`,
        definition: setup.fort,
        position: { x: s.x, y: s.z },
        rotation: s.rotation ?? 0,
        owner,
        initialState: { construction: "complete", inventory: setup.inventory },
      }),
    );
    startingUnits(setup,slots.find(slot=>slot.player===s.player-1)?.hero).forEach((u, i) =>
      result.push(
        placementSchema.parse({
          id: `${prefix}/unit-${String(i + 1).padStart(3, "0")}`,
          definition: u.definition,
          position: startingUnitPosition(s,u.offset),
          rotation: s.rotation ?? 0,
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
  slots: readonly Slot[] = [],
): void {
  if(map.mission) {
    missionSchema.parse(map.mission);
    raceDefinition(registry.rules,map.mission.race??registry.rules.campaigns[map.mission.campaign]?.race);
    for(const [owner,race] of Object.entries(map.mission.playerRaces??{})){raceDefinition(registry.rules,race);if(!map.playerStarts.some(s=>`player.${s.player}`===owner))throw Error(`Mission race assigned to missing participant ${owner}`);}
    for(const tag of map.mission.company??[]){
      const p=map.entities.find(p=>p.id===tag);
      if(!p||p.activation||p.owner!=='player.1'||registry.get(p.definition).kind!=='unit')throw new Error(`Invalid campaign company slot: ${tag}`);
    }
  }
  const all = expandMap(map, registry, slots),
    ids = new Set<string>();
  const floor=all.some(p=>p.position.surface)?placementFloors(map):undefined;
  for (const raw of all) {
    const p = placementSchema.parse(raw),
      d = registry.get(p.definition),
      state = p.initialState;
    const geometryError = placementGeometryError(d, p.position, p.rotation);
    if (geometryError) throw new Error(`${p.id}: ${geometryError}`);
    if (p.activation && !map.mission) throw new Error(`${p.id}: scripted spawns require a mission map`);
    if (d.currency)
      throw new Error(`${p.id}: currencies cannot be placed on the ground`);
    if (d.harvesting && p.owner !== "none")
      throw new Error(`${p.id}: mines must be neutral`);
    if (ids.has(p.id)) throw new Error(`Duplicate placement ${p.id}`);
    ids.add(p.id);
    if (p.position.x >= map.size || p.position.y >= map.size)
      throw new Error(`${p.id}: outside map bounds`);
    if (d.kind === 'building') {
      const bounds = footprintCellBounds(p.position,d.footprint,p.rotation);
      if (bounds.minX < 0 || bounds.minY < 0 || bounds.maxX >= map.size || bounds.maxY >= map.size)
        throw new Error(`${p.id}: building footprint is outside map bounds`);
    }
    if(p.position.surface){
      if(floor!(p.position)===undefined)throw new Error(`${p.id}: unknown or out-of-bounds walk surface`);
      if(d.kind==='building'||d.kind==='resource')throw new Error(`${p.id}: buildings and harvestable resources currently require ground`);
    }
    if (
      p.owner !== "none" &&
      !map.playerStarts.some((s) => p.owner === `player.${s.player}`)
    )
      throw new Error(`${p.id}: missing owner slot`);
    const levels = d.behaviors.progression?.levels;
    if (state?.experience !== undefined && (!levels || state.experience > levels[Math.min(levels.length, map.mission?.heroLevelCap ?? levels.length)-1].experience))
      throw new Error(`${p.id}: initial experience exceeds hero or mission limit`);
    const initialLevel = levels?.filter(l => l.experience <= (state?.experience ?? 0)).at(-1);
    if (state?.health !== undefined && (!d.body || state.health > (initialLevel?.maxHp ?? d.body.maxHp)))
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
  for (const s of map.mission || map.sandbox ? [] : map.playerStarts) {
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
  const occupied = new Map<number, {id:string;height:number}[]>();
  const placements=expandMap(map,registry),floor=placements.some(p=>p.position.surface)?placementFloors(map):undefined;
  type UnitBody={id:string;x:number;y:number;radius:number;height:number;floor:number;air:boolean};
  const units:UnitBody[]=[],unitCells=new Map<number,UnitBody[]>();
  let maxRadius=0;
  for (const p of placements) {
    const d = registry.get(p.definition);
    if (d.kind === "item" || (d.kind === "resource" && p.initialState?.amount === 0)) continue;
    if(d.kind==='unit'){
      const {radius,height}=d.dimensions!,{x,y}=p.position;
      if(x-radius<-.5||y-radius<-.5||x+radius>map.size-.5||y+radius>map.size-.5)
        return `${p.id}: body is outside the playable map`;
      // Deferred units may emerge from an occupied cage, but still need valid bounds.
      if(p.activation==='script')continue;
      const body={id:p.id,x,y,radius,height,floor:floor?.(p.position)??0,air:d.behaviors.movement?.locomotion==='air'};
      units.push(body);maxRadius=Math.max(maxRadius,radius);
      const cell=Math.round(y)*map.size+Math.round(x),column=unitCells.get(cell)??[];
      column.push(body);unitCells.set(cell,column);
      continue;
    }
    const bounds = footprintCellBounds(p.position, d.footprint, p.rotation);
    for (let y = bounds.minY; y <= bounds.maxY; y++) for (let x = bounds.minX; x <= bounds.maxX; x++) {
      if (x < 0 || x >= map.size || y < 0 || y >= map.size)
        return `${p.id}: footprint is outside the playable map`;
      // Deferred scenery may deliberately replace a destroyed object.
      if(p.activation==="script")continue;
      const cell=y*map.size+x,height=floor?.({...p.position,x,y})??0;
      const column=occupied.get(cell)??[],other=column.find(e=>Math.abs(e.height-height)<2);
      if(other)return `${p.id}: overlaps ${other.id}`;
      column.push({id:p.id,height});occupied.set(cell,column);
    }
  }
  for(const unit of units){
    // Static terrain uses the conservative square navigation footprint. Unit
    // separation uses circles, just like runtime body sweeps. Keep these distinct.
    if(!unit.air)for(let y=Math.max(0,Math.floor(unit.y-unit.radius+.5));y<=Math.min(map.size-1,Math.floor(unit.y+unit.radius+.5));y++)
      for(let x=Math.max(0,Math.floor(unit.x-unit.radius+.5));x<=Math.min(map.size-1,Math.floor(unit.x+unit.radius+.5));x++)
        for(const other of occupied.get(y*map.size+x)??[]){
          if(Math.abs(other.height-unit.floor)>=2)continue;
          if(navigationBodyOverlapsBounds(unit,unit.radius,{minX:x-.5,minY:y-.5,maxX:x+.5,maxY:y+.5}))
            return `${unit.id}: body overlaps ${other.id}`;
        }
    const reach=unit.radius+maxRadius;
    for(let y=Math.max(0,Math.floor(unit.y-reach));y<=Math.min(map.size-1,Math.ceil(unit.y+reach));y++)
      for(let x=Math.max(0,Math.floor(unit.x-reach));x<=Math.min(map.size-1,Math.ceil(unit.x+reach));x++)
        for(const other of unitCells.get(y*map.size+x)??[]){
          if(other.id>=unit.id||other.air!==unit.air)continue;
          if(floor&&(unit.floor>=other.floor+other.height||other.floor>=unit.floor+unit.height))continue;
          // Fixed-point rounding agrees with runtime even for fractional radii.
          const dx=Math.round(unit.x*1000)-Math.round(other.x*1000),dy=Math.round(unit.y*1000)-Math.round(other.y*1000);
          const separation=Math.round(unit.radius*1000)+Math.round(other.radius*1000);
          if(dx*dx+dy*dy<separation*separation)return `${unit.id}: overlaps ${other.id}`;
        }
  }
  return null;
}

/** Authoring gate: starting halls preserve the same resource access lane as construction. */
export function startingResourceClearanceError(map:UtcMap,registry:ContentRegistry):string|null {
 if(map.mission||map.sandbox)return null;
 const hall=registry.get(registry.rules.startingSetup.fort);
 const resources=[...map.entities,...(projectScene(map)?.resources??[])];
 for(const s of map.playerStarts)for(const resource of resources){
  const definition=registry.get(resource.definition),clearance=definition.constructionClearance;
  if(clearance===undefined||resource.activation==='script'||(resource.initialState?.amount??definition.yield??0)<=0)continue;
  const minimum=resourceCenterSeparation(hall.footprint!,definition.footprint??{width:1,depth:1},clearance,s.rotation??0,resource.rotation);
  if(Math.abs(s.x-resource.position.x)<minimum.x&&Math.abs(s.z-resource.position.y)<minimum.y)
   return `Player ${s.player}: ${hall.name} is too close to ${definition.name}; leave at least ${minimum.x} cells horizontally or ${minimum.y} cells vertically between centers.`;
 }
 return null;
}
