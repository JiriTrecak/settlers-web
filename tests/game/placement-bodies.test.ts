import {expect, it} from 'vitest';
import {game, placed} from './helpers';
import type {Definition} from '../../src/content/schema';

it('rejects a foundation overlapping a body whose center cell is outside the footprint', () => {
  const g = game([placed('pioneer', 'unit.ants.settler', 125, 128)]);
  const unit = g.entities.find(e => e.placement === 'pioneer')!;
  const site = {x: 131.5, y: 131.5}; // left physical edge 127.5
  expect(g.canBuild(unit.owner, 'building.ants.house', site, unit.id)).toBeNull();
  unit.unit!.position = {x: 126100, y: 128000};
  expect(unit.x).toBe(125); // still outside the foundation's navigation cells
  expect(g.canBuild(unit.owner, 'building.ants.house', site, unit.id)).toBe('Placement blocked');
  expect(g.command(unit.owner, {type: 'build', actors: [unit.id], definition: 'building.ants.house', position: site}).accepted).toBe(false);
  unit.unit!.position = {x: 125900, y: 128000};
  expect(g.canBuild(unit.owner, 'building.ants.house', site, unit.id)).toBeNull();
});

it('uses the declared body radius rather than a single universal cell for construction clearance', () => {
  const g = game([placed('pioneer', 'unit.ants.settler', 127, 128)], draft => {
    const definition = (draft.definitions as Definition[]).find(d => d.id === 'unit.ants.settler')!;
    definition.dimensions = {radius: .6, height: 2, formationSpacing: 2};
  });
  const unit = g.entities.find(e => e.placement === 'pioneer')!;
  expect(g.canBuild(unit.owner, 'building.ants.house', {x: 131.5, y: 131.5}, unit.id)).toBe('Placement blocked');
});

it('does not place foundations through harvesting workers even when harvest movement ignores other units',()=>{
 const g=game([placed('pioneer','unit.ants.settler',128,128),{...placed('tree','resource.forest.tree',120,128),owner:'none'}]);
 const worker=g.entities.find(e=>e.placement==='pioneer')!,tree=g.entities.find(e=>e.placement==='tree')!;
 expect(g.command(worker.owner,{type:'gather',actors:[worker.id],target:tree.id}).accepted).toBe(true);
 expect(g.spatial.ignoresUnits(worker)).toBe(true);
 expect(g.canBuild(worker.owner,'building.ants.house',{x:131.5,y:131.5},worker.id)).toBe('Placement blocked');
});

it('rejects a foundation corner that would overlap the existing conservative navigation footprint',()=>{
 const g=game([placed('pioneer','unit.ants.settler',222,232)]),unit=g.entities.find(e=>e.placement==='pioneer')!;
 g.economy.remove(g.context.get(g.state.objectives['player.1'])!);
 // The circular body misses this corner, but its square terrain sweep would
 // start inside the new blocker and strand the unit. Placement must prevent it.
 expect(g.canBuild(unit.owner,'building.ants.fort',{x:233.5,y:221.5},unit.id)).toBe('Placement blocked');
});
