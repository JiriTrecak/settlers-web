import { expect, it } from "vitest";
import { HealthPips, healthPipState } from "../../src/render/settlement/healthPips";
it("steps through four health tiers at quarter-health boundaries", () => {
  expect([100,75,50,25,0].map(h => healthPipState(h,100,false).filled)).toEqual([4,3,2,1,0]);
  expect([100,75,50,25].map(h => healthPipState(h,100,false).color)).toEqual([0x65ef62,0xf3d94b,0xf19436,0xe74639]);
  expect(healthPipState(50,100,true).filled).toBe(8);
});
it("reuses sprite textures and only changes the current pip when blinking", () => {
  const pips = new HealthPips();
  const normal = pips.material(50,100,false,false);
  expect(pips.material(49,100,false,false)).toBe(normal);
  const blink = pips.material(50,100,false,true);
  const a = (normal.map!.image as {data: Uint8Array}).data, b = (blink.map!.image as {data: Uint8Array}).data;
  let changed = 0;
  for (let i=0;i<a.length;i+=4) if(a[i]!==b[i] || a[i+1]!==b[i+1] || a[i+2]!==b[i+2]) {
    const x = (i/4)%128;
    expect(x).toBeGreaterThan(30); expect(x).toBeLessThan(65); changed++;
  }
  expect(changed).toBeGreaterThan(0);
  pips.dispose();
});
