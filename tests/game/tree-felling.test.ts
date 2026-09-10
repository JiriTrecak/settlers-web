import { describe, it, expect } from 'vitest';
import { game, placed, worker, run } from './helpers';
import { resourceStamps } from '../../src/presentation/scenery';

function setup() {
  const g = game([{...placed('tree', 'resource.forest.tree', 205, 215), owner: 'none'}]);
  const w = worker(g), tree = g.entities.find(e => e.placement === 'tree')!;
  g.command(w.owner, {type: 'gather', actors: [w.id], target: tree.id});
  return {g, w, tree};
}

describe('tree felling', () => {
  it('requires exactly ten contacts, preserves one load, and waits for the fall before departure', () => {
    const {g, w, tree} = setup(), f = tree.resource!.felling!;
    const hall = g.context.get(g.state.objectives[w.owner])!, before = hall.inventory['item.wood'];
    let contacts = 0, previous = 10, previousTick = 0;
    for (let ticks = 0; ticks < 1600 && f.hp > 0; ticks++) {
      g.tick();
      if (f.hp !== previous) {
        expect(previous - f.hp).toBe(1); contacts++;
        if (contacts > 1) expect(g.state.tick - previousTick).toBe(40);
        previousTick = g.state.tick; previous = f.hp;
        if (f.hp > 0) {
          expect(w.unit!.cargo).toBeNull(); expect(tree.resource!.amount).toBe(10);
        }
      }
    }
    expect(contacts).toBe(10); expect(f.hp).toBe(0);
    expect(f.lastHitTick).toBe(f.fallTick);
    expect(w.unit!.cargo).toEqual({item: 'item.wood', amount: 10});
    expect(tree.resource!.amount).toBe(0); expect(hall.inventory['item.wood']).toBe(before);
    const job = g.state.jobs.find(j => j.worker === w.id)!;
    const position = structuredClone(w.unit!.position);
    expect(job.phase).toBe('fall');
    run(g, 71); expect(job.phase).toBe('fall'); expect(w.unit!.position).toEqual(position);
    g.tick(); expect(job.phase).toBe('return');
    for (let i = 0; i < 1600 && w.unit!.cargo; i++) g.tick();
    expect(hall.inventory['item.wood']).toBe(before + 10);
    expect(f.hp).toBe(0); expect(f.lastHitTick).toBe(previousTick);
  });
  it('keeps chopping health across stop/resume and restores both damaged and falling trees exactly', () => {
    const {g, w, tree} = setup(), f = tree.resource!.felling!;
    for (let i = 0; i < 1200 && f.hp > 6; i++) g.tick();
    expect(f.hp).toBe(6);
    g.command(w.owner, {type: 'stop', actors: [w.id]}); run(g, 120);
    expect(f.hp).toBe(6); expect(tree.resource!.amount).toBe(10);
    const restored = setup().g; restored.restore(g.snapshot());
    for (const target of [g, restored]) target.command(w.owner, {type:'gather', actors:[w.id], target:tree.id});
    for (let i = 0; i < 1200 && f.hp > 0; i++) { g.tick(); restored.tick(); }
    expect(f.hp).toBe(0); expect(restored.snapshot()).toEqual(g.snapshot());
    const falling = setup().g; falling.restore(g.snapshot());
    run(g, 1200); run(falling, 1200);
    expect(falling.snapshot()).toEqual(g.snapshot());
  });
  it('reserves a whole tree for one worker and keeps observers from seeing unseen axe hits', () => {
    const {g, w, tree} = setup();
    const other = g.entities.find(e => e.id !== w.id && e.owner === w.owner && g.registry.get(e.definition).behaviors.work)!;
    g.command(w.owner, {type:'gather', actors:[other.id], target:tree.id});
    run(g, 220);
    expect(g.state.jobs.filter(j => j.source === tree.id)).toHaveLength(1);
    expect(tree.resource!.felling!.hp).toBeLessThan(10);
    expect(g.view(1).entities.find(e => e.id === tree.id)).toBeUndefined();
    expect(resourceStamps(g.view(0).entities).some(s => s.id === `resource-${tree.id}`)).toBe(false);
  });
});

it('freezes a remembered tree when chopping continues outside vision', () => {
  const {g, tree} = setup();
  const scout = g.context.create({...placed('scout', 'unit.ants.settler', tree.x+2, tree.y), owner: 'player.2'});
  g.observation.update();
  expect(g.view(1).entities.find(e => e.id === tree.id)?.resource?.felling?.hp).toBe(10);
  scout.x = 32; scout.y = 32; scout.unit!.position = null;
  g.observation.update();
  run(g, 300);
  expect(tree.resource!.felling!.hp).toBeLessThan(10);
  const remembered = g.view(1).entities.find(e => e.id === tree.id)!;
  expect(remembered.remembered).toBe(true);
  expect(remembered.resource!.felling!.hp).toBe(10);
  expect(remembered.resource!.felling!.lastHitTick).toBeNull();
});
