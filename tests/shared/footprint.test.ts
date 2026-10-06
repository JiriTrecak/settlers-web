import {describe, expect, it} from 'vitest';
import {BUILDING_CELL_SIZE, NAV_CELL_SIZE, navigationBodyOverlapsBounds, footprintAligned, footprintBounds,
  footprintCellBounds, footprintCells, snapFootprint} from '../../src/shared/spatial/footprint';
import {resourceBlocksCell, resourceCenterSeparation, resourceCollisionCells} from '../../src/shared/map/resourceClearance';

describe('building and navigation lattices', () => {
  it('has exactly sixteen navigation cells per building cell, independent of content scaling', () => {
    expect(BUILDING_CELL_SIZE / NAV_CELL_SIZE).toBe(4);
    for (const cells of [2, 3, 5]) {
      const footprint = {width: cells * BUILDING_CELL_SIZE, depth: cells * BUILDING_CELL_SIZE};
      const center = snapFootprint({x: 71.1, y: 82.7}, footprint);
      expect(footprintAligned(center, footprint)).toBe(true);
      expect(footprintCells(center, footprint)).toHaveLength(cells * cells * 16);
    }
  });

  it('snaps rotated even, odd and rectangular footprints without growing them', () => {
    for (let width = 1; width <= 20; width++) for (let depth = 1; depth <= 20; depth++) {
      for (const rotation of [0, 90, 180, 270, -90]) {
        const f = {width, depth}, p = snapFootprint({x: 30.13, y: 40.87}, f, rotation, NAV_CELL_SIZE);
        const raster = footprintCells(p, f, rotation), b = footprintBounds(p, f, rotation);
        expect(footprintAligned(p, f, rotation, NAV_CELL_SIZE)).toBe(true);
        expect(raster).toHaveLength(width * depth);
        expect(new Set(raster.map(c => `${c.x}/${c.y}`)).size).toBe(width * depth);
        expect(raster.every(c => Number.isInteger(c.x) && Number.isInteger(c.y))).toBe(true);
        expect(Math.min(...raster.map(c => c.x)) - .5).toBe(b.minX);
        expect(Math.max(...raster.map(c => c.y)) + .5).toBe(b.maxY);
      }
    }
  });

  it('gives adjacent snapped foundations a shared edge without sharing any navigation cell', () => {
    const hall = {width: 20, depth: 20}, mound = {width: 8, depth: 8};
    const a = snapFootprint({x: 30, y: 30}, hall), b = {x: a.x + 14, y: a.y};
    expect(footprintAligned(b, mound)).toBe(false); // centered beside a 5C hall: wrong parity in Y
    const aligned = snapFootprint(b, mound);
    const occupied = new Set(footprintCells(a, hall).map(p => `${p.x}/${p.y}`));
    expect(footprintCells(aligned, mound).some(p => occupied.has(`${p.x}/${p.y}`))).toBe(false);
    expect(footprintBounds(a, hall).maxX).toBe(footprintBounds(aligned, mound).minX);
  });

  it('conservatively rasterizes an unsnapped rectangle rather than writing fractional array indices', () => {
    expect(footprintCellBounds({x: 10, y: 10}, {width: 2, depth: 2}))
      .toEqual({minX: 9, minY: 9, maxX: 11, maxY: 11});
    expect(footprintAligned({x: 10, y: 10}, {width: 2, depth: 2}, 0, NAV_CELL_SIZE)).toBe(false);
    expect(footprintCells({x: 10.2, y: 10.7}, {width: 2, depth: 2})
      .every(p => Number.isInteger(p.x) && Number.isInteger(p.y))).toBe(true);
  });
});

it('uses the same physical service-lane boundary for even resource and building footprints', () => {
  const f = {width: 8, depth: 12}, hall = {width: 20, depth: 20}, clearance = 12;
  const separation = resourceCenterSeparation(hall, f, clearance, 0, 90);
  expect(separation).toEqual({x: 28, y: 26});
  const center = {x: 49.5, y: 49.5}, resource = {x: center.x + separation.x, y: center.y};
  expect(footprintCells(center, hall).some(c => resourceBlocksCell(c, resource, f, clearance, 90))).toBe(false);
  expect(footprintCells(center, hall).some(c => resourceBlocksCell(c, {...resource, x: resource.x - 1}, f, clearance, 90))).toBe(true);
  expect(resourceCollisionCells({x: 20.5, y: 20.5}, {width: 8, depth: 8}, undefined)).toHaveLength(64);
});

it('matches conservative navigation body coverage at edges and corners', () => {
  const b = footprintBounds({x: 10, y: 10}, {width: 3, depth: 3});
  expect(navigationBodyOverlapsBounds({x: 12, y: 10}, .6, b)).toBe(true);
  expect(navigationBodyOverlapsBounds({x: 12, y: 10}, .5, b)).toBe(false);
  expect(navigationBodyOverlapsBounds({x: 8, y: 10}, .5, b)).toBe(true); // lower raster edge is included
  expect(navigationBodyOverlapsBounds({x: 8, y: 10}, .49, b)).toBe(false);
  expect(navigationBodyOverlapsBounds({x: 12, y: 12}, .7, b)).toBe(true);
});
