import {expect, it} from 'vitest';
import {game, placed, run, slots} from './helpers';
import {Game} from '../../src/sim/game/game';
import {content} from '../../src/content/builtin';
import {testContent} from '../fixtures/content';
import {actionSchema} from '../../src/shared/types/types';
import {emptyUtcMap, parseUtcMap} from '../../src/shared/map/utcmap';
import {expandMap, validatePlacements, placementOccupancyError} from '../../src/content/map';
import {putEntity} from '../../src/editor/world/entityAuthoring';
import {footprintAligned,BUILDING_CELL_SIZE} from '../../src/shared/spatial/footprint';
import {placementGeometryError} from '../../src/shared/spatial/placement';
import type {Definition} from '../../src/content/schema';

it('declares whole-C building footprints and exactly integral entrance navigation cells', () => {
  const g = game();
  for (const d of testContent.definitions.filter(d => d.kind === 'building')) {
    const p = placed('structure', d.id, 100, 100);
    for (const rotation of [0, 90, 180, 270]) {
      const candidate = {definition:d.id,...p.position,rotation};
      expect(placementGeometryError(d,p.position,rotation)).toBeNull();
      expect(g.spatial.footprint(candidate)).toHaveLength(d.footprint!.width * d.footprint!.depth);
      expect(g.spatial.footprint(candidate).every(Number.isInteger)).toBe(true);
      const door = g.spatial.entrance(candidate);
      expect(Number.isInteger(door.x) && Number.isInteger(door.y)).toBe(true);
      expect(g.spatial.footprint(candidate)).not.toContain(g.spatial.cell(door));
      expect(g.spatial.perimeter(candidate).every(p => Number.isInteger(p.x) && Number.isInteger(p.y))).toBe(true);
    }
  }
});

it('preserves snapped static centers in map serialization, while setup units use navigation centers', () => {
  const map = emptyUtcMap(), restored = parseUtcMap(JSON.parse(JSON.stringify(map)))!;
  expect(restored.playerStarts).toEqual(map.playerStarts);
  expect(() => validatePlacements(restored,testContent)).not.toThrow();
  expect(placementOccupancyError(restored,testContent)).toBeNull();
  for (const p of expandMap(restored,testContent)) {
    const d = testContent.get(p.definition);
    expect(placementGeometryError(d,p.position,p.rotation)).toBeNull();
    if (d.kind === 'unit') expect(Number.isInteger(p.position.x) && Number.isInteger(p.position.y)).toBe(true);
  }
});

// ENGINE-COUPLED: putEntity validates against the global shipped content, so use a shipped building whose footprint
// is at least two building cells wide; an aligned center inside the first cell then crosses the map edge.
it('snaps editor building placement and rotation, but rejects unsnapped imported foundations', () => {
  const building = content.definitions.find(d => d.kind === 'building' && d.footprint && d.footprint.width % 2 === 0 && d.footprint.depth % 2 === 0 && d.footprint.width >= 2 * BUILDING_CELL_SIZE)!;
  const raw = {...placed('mound',building.id,100,100),position:{x:100,y:100},rotation:17};
  const map = putEntity(emptyUtcMap(),raw), p = map.entities[0]!;
  expect(p.rotation).toBe(0);
  expect(footprintAligned(p.position,content.get(p.definition).footprint!)).toBe(true);
  expect(() => validatePlacements({...map,entities:[raw]},content)).toThrow(/90-degree/);
  expect(() => validatePlacements({...map,entities:[{...raw,rotation:0}]},content)).toThrow(/building grid/);
  expect(() => validatePlacements({...map,entities:[{...p,position:{x:p.position.x%BUILDING_CELL_SIZE,y:p.position.y}}]},content)).toThrow(/outside map bounds/);
});

it('constructs a snapped foundation identically after save/load and rejects off-grid commands', () => {
  const g = game([placed('pioneer','unit.test.settler',128,128)], draft => {
    (draft.definitions as Definition[]).find(d => d.id === 'building.test.house')!.creation!.workTicks = 4;
  });
  const actor = g.entities.find(e => e.placement === 'pioneer')!.id;
  const action = {type:'build' as const,actors:[actor],definition:'building.test.house',position:{x:135.5,y:127.5},rotation:0};
  expect(actionSchema.safeParse(action).success).toBe(true);
  expect(g.command('player.1',{...action,position:{x:136,y:128}}).reason).toMatch(/building grid/);
  expect(g.command('player.1',action).accepted).toBe(true);
  run(g,20);
  const saved = g.snapshot(), restored = new Game(g.map,slots,g.registry);
  restored.restore(saved);
  run(g,240); run(restored,240);
  expect(restored.checksum('full')).toBe(g.checksum('full'));
  const house = g.entities.find(e => e.definition === action.definition)!;
  expect(house).toMatchObject({x:135.5,y:127.5});
  expect(house.construction).toBeUndefined();
  expect(g.spatial.footprint(house)).toHaveLength(64);
  const invalid = g.snapshot();
  invalid.state.entities.find(e => e.id === house.id)!.x += .5;
  expect(() => restored.restore(invalid)).toThrow(/Invalid saved position/);
});
