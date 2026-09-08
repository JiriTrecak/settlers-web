/** Streaming deterministic digest. Avoid allocating JSON/number arrays for fog grids every checkpoint. */
export function simulationHash(value: unknown): number {
  let h = 2166136261;
  const bytes = new DataView(new ArrayBuffer(8));
  const mix = (n: number) => {
    h = Math.imul(h ^ n, 16777619);
  };
  const text = (s: string) => {
    mix(s.length);
    for (let i = 0; i < s.length; i++) mix(s.charCodeAt(i));
  };
  const visit = (v: unknown): void => {
    if (v === null || v === undefined) {
      mix(0);
      return;
    }
    if (typeof v === "boolean") {
      mix(v ? 1 : 2);
      return;
    }
    if (typeof v === "number") {
      mix(3);
      bytes.setFloat64(0, v, true);
      mix(bytes.getUint32(0, true));
      mix(bytes.getUint32(4, true));
      return;
    }
    if (typeof v === "string") {
      mix(4);
      text(v);
      return;
    }
    if (v instanceof Uint8Array || v instanceof Int16Array) {
      mix(5);
      mix(v.length);
      for (let i = 0; i < v.length; i++) mix(v[i]);
      return;
    }
    if (Array.isArray(v)) {
      mix(6);
      mix(v.length);
      for (const item of v) visit(item);
      return;
    }
    if (v instanceof Map) {
      mix(7);
      mix(v.size);
      for (const [k, item] of [...v].sort((a, b) =>
        a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0,
      )) {
        visit(k);
        visit(item);
      }
      return;
    }
    const object = v as Record<string, unknown>,
      keys = Object.keys(object)
        .filter((k) => object[k] !== undefined)
        .sort();
    mix(8);
    mix(keys.length);
    for (const key of keys) {
      text(key);
      visit(object[key]);
    }
  };
  visit(value);
  return h >>> 0;
}
