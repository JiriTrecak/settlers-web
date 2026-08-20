/**
 * Which sprite atlas a catalog path belongs to. Landscape stays on its own
 * wrap atlas. GUI screens and uncatalogued dumps are left as loose PNGs.
 */
export const CIVS = ["roman", "egyptian", "asian", "amazon"] as const;
export type Civ = (typeof CIVS)[number];

export type CatalogHint = {
  path: string;
  group?: string;
  category?: string;
};

const CIV_RE = new RegExp(`^(?:settlers|buildings)/(${CIVS.join("|")}|shared)/`);

/** Pack name (`props`, `settlers-roman`, …) or null to skip. */
export function packOf(s: CatalogHint): string | null {
  const path = s.path.replace(/\\/g, "/");
  if (path === "landscape-atlas.png" || path.startsWith("atlases/")) return null;
  const group = (s.group ?? "").replace(/\\/g, "/");
  const category = s.category ?? "";
  if (category === "landscape" || path.startsWith("landscape/") || group.startsWith("landscape")) return null;
  if (category === "gui" || path.startsWith("gui/") || group.startsWith("gui/")) return null;
  if (category === "uncatalogued" || path.startsWith("uncatalogued/") || group.startsWith("uncatalogued/")) {
    return null;
  }
  const hit = CIV_RE.exec(group) ?? CIV_RE.exec(path);
  if (hit) {
    const kind = group.startsWith("buildings/") || path.startsWith("buildings/") ? "buildings" : "settlers";
    const civ = hit[1]!;
    if (kind === "buildings" && civ === "shared") return "props";
    return `${kind}-${civ}`;
  }
  if (category === "props" || path.startsWith("props/") || group.startsWith("props/")) return "props";
  return null;
}

/** Shared pages first, then buildings, then settlers — roman on top for the contact sheet. */
export function packOrder(names: readonly string[]): string[] {
  const rank = (p: string): [number, number, string] => {
    if (p === "props") return [0, 0, p];
    if (p === "settlers-shared") return [1, 0, p];
    const m = /^(buildings|settlers)-(.+)$/.exec(p);
    if (m) {
      const civ = CIVS.indexOf(m[2] as Civ);
      return [m[1] === "buildings" ? 2 : 3, civ < 0 ? 99 : civ, p];
    }
    return [9, 0, p];
  };
  return [...names].sort((a, b) => {
    const aa = rank(a);
    const bb = rank(b);
    return aa[0] - bb[0] || aa[1] - bb[1] || aa[2].localeCompare(bb[2]);
  });
}

/** Runtime packs for a match: props + each civ's buildings/settlers. */
export function packsForCivs(civs: readonly string[]): string[] {
  const out = ["props"];
  const seen = new Set(out);
  const add = (p: string) => {
    if (seen.has(p)) return;
    seen.add(p);
    out.push(p);
  };
  add("settlers-shared");
  for (const civ of civs) {
    add(`buildings-${civ}`);
    add(`settlers-${civ}`);
  }
  return out;
}
