import { describe, expect, it } from "vitest";
import { randomBelow, rollLoot } from "../../src/sim/game/loot";

describe("deterministic weighted loot", () => {
  it("replays the exact sequence after restoring PRNG state", () => {
    const state = { random: 19341 };
    const pool = { rolls: 2, entries: [{item:"item.ring",weight:2},{item:"item.salve",weight:7},{item:null,weight:3}] };
    for (let i=0;i<10;i++) rollLoot(state,pool);
    const restored = structuredClone(state);
    const draws = Array.from({length:50},()=>rollLoot(state,pool));
    expect(Array.from({length:50},()=>rollLoot(restored,pool))).toEqual(draws);
    expect(restored).toEqual(state);
  });
  it("respects guaranteed entries, no-drop entries and weighted frequencies", () => {
    const state = { random: 42 };
    expect(rollLoot(state,{rolls:3,entries:[{item:"item.ring",weight:1}]})).toEqual(["item.ring","item.ring","item.ring"]);
    expect(rollLoot(state,{rolls:3,entries:[{item:null,weight:1}]})).toEqual([]);
    const pool = {rolls:1,entries:[{item:"common",weight:9},{item:"rare",weight:1}]};
    let rare=0;
    for(let i=0;i<10000;i++)if(rollLoot(state,pool)[0]==="rare")rare++;
    expect(rare).toBeGreaterThan(850);expect(rare).toBeLessThan(1150);
  });
  it("rejects absorbing seeds and invalid pools instead of hanging or silently losing loot", () => {
    expect(()=>randomBelow({random:0},3)).toThrow();
    for(const n of [0,-1,1.5,Infinity,0x100000000])expect(()=>randomBelow({random:1},n)).toThrow();
    expect(()=>rollLoot({random:1},{rolls:1,entries:[]})).toThrow();
    expect(()=>rollLoot({random:1},{rolls:1,entries:[{item:"x",weight:0}]})).toThrow();
  });
});
