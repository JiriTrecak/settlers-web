import {expect, it} from 'vitest';
import {game, placed, run, slots} from './helpers';
import {Game} from '../../src/sim/game/game';

const owner = 'player.1';
const setup = () => game([
  placed('supply', 'building.ants.house', 245, 240),
  placed('barracks', 'building.ants.barracks', 205, 210),
]);

it('credits authored starting funds once, without storing them inside a building', () => {
  const g = setup(), hall = g.context.get(g.state.objectives[owner])!;
  expect(g.state.wallets[owner]).toEqual(g.registry.rules.startingSetup.inventory);
  expect(hall.inventory).toEqual({});
  const restored = new Game(g.map, slots, g.registry);
  restored.restore(g.snapshot());
  expect(restored.state.wallets).toEqual(g.state.wallets);
  expect(restored.checksum('full')).toBe(g.checksum('full'));
});

it('retains funds after the last Hall is destroyed and can fund a replacement project', () => {
  const g = setup(), before = structuredClone(g.state.wallets[owner]);
  g.economy.remove(g.context.get(g.state.objectives[owner])!);
  expect(g.state.wallets[owner]).toEqual(before);
  expect(g.state.accounting.lost).toEqual({});
  const project = g.context.create(placed('replacement', 'building.ants.house', 230, 230), false);
  const payment = g.economy.reserveBill(owner, project.definition);
  expect(payment).not.toBeNull();
  g.economy.admitProject(project, payment!);
  g.economy.remove(project, true);
  expect(g.state.wallets[owner]).toEqual({'item.amber':475,'item.wood':143});
  expect(g.state.accounting.lost).toEqual({'item.amber':25,'item.wood':7});
});

it('separates paid queue escrow from spending money and refunds it without a Hall', () => {
  const g = setup(), b = g.entities.find(e => e.placement === 'barracks')!;
  const before = structuredClone(g.state.wallets[owner]);
  const q = g.economy.queue(b, 'unit.ants.archer')!;
  expect(q).not.toBeNull();
  const bill = g.registry.get('unit.ants.archer').creation!.items;
  for (const p of bill) {
    expect(g.economy.balance(owner, p.item)).toBe(before[p.item] - p.amount);
    expect(b.inventory[p.item]).toBe(p.amount);
    expect(g.view(owner).goods!.find(r => r.item === p.item)).toMatchObject({stored: before[p.item], reserved: p.amount, available: before[p.item] - p.amount});
  }
  g.economy.remove(g.context.get(g.state.objectives[owner])!);
  g.economy.remove(b, true);
  expect(g.state.wallets[owner]).toEqual(before);
});

it('loses destroyed production escrow, but not the rest of the wallet', () => {
  const g = setup(), b = g.entities.find(e => e.placement === 'barracks')!;
  g.economy.queue(b, 'unit.ants.archer');
  const funds = structuredClone(g.state.wallets[owner]), escrow = {...b.inventory};
  g.economy.remove(b);
  expect(g.state.wallets[owner]).toEqual(funds);
  expect(g.state.accounting.lost).toEqual(escrow);
});

it('does not debit any currency for an unaffordable bill or leak another player’s wallet', () => {
  const g = setup(), before = structuredClone(g.state.wallets);
  expect(g.economy.reserveCost(owner, {'item.amber': 1, 'item.root': 999})).toBeNull();
  expect(g.state.wallets).toEqual(before);
  const ownView = structuredClone(g.view(owner));
  g.state.wallets['player.2']['item.amber'] = 9876;
  const amber = g.view(owner).goods!.find(r => r.item === 'item.amber')!;
  expect(amber.available).toBe(before[owner]['item.amber']);
  expect(g.view(owner)).toEqual(ownView);
  expect(g.view('player.2').goods!.find(r => r.item === 'item.amber')!.available).toBe(9876);
});

it('fingerprints wallets in both checksum modes independently of key order and replays purchases after restore', () => {
  const g = setup(), before = [g.checksum(), g.checksum('full')];
  g.state.wallets[owner]['item.amber']++;
  expect(g.checksum()).not.toBe(before[0]);
  expect(g.checksum('full')).not.toBe(before[1]);
  const restored = new Game(g.map, slots, g.registry);
  restored.restore(g.snapshot());
  restored.state.wallets = Object.fromEntries(Object.entries(restored.state.wallets).reverse().map(([o, stock]) => [o, Object.fromEntries(Object.entries(stock).reverse())]));
  expect(restored.checksum()).toBe(g.checksum());
  expect(restored.checksum('full')).toBe(g.checksum('full'));
  for (const match of [g, restored]) {
    const b = match.entities.find(e => e.placement === 'barracks')!;
    expect(match.command(owner, {type: 'produce', actor: b.id, definition: 'unit.ants.archer'}).accepted).toBe(true);
    run(match, 80);
  }
  expect(restored.checksum('full')).toBe(g.checksum('full'));
  expect(restored.state.wallets).toEqual(g.state.wallets);
});

it('rejects invalid wallet owners, non-currency items, negatives and fractional currency in saves', () => {
  const g = setup();
  const invalid: Game['state']['wallets'][] = [
    {'none': {'item.amber': 1}},
    {'player.8': {'item.amber': 1}},
    {[owner]: {'item.barkguard': 1}},
    {[owner]: {'item.missing': 1}},
    {[owner]: {'item.amber': -1}},
    {[owner]: {'item.amber': 1.5}},
  ];
  for (const wallets of invalid) {
    const save = g.snapshot(); save.state.wallets = wallets;
    expect(() => g.restore(save)).toThrow();
  }
});
