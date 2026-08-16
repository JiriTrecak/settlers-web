import { readFile } from "node:fs/promises";

export type Civ = "roman" | "egyptian" | "asian" | "amazon" | "shared";

export const CIVS: Civ[] = ["roman", "egyptian", "asian", "amazon"];
export const CIV_FILE: Record<Exclude<Civ, "shared">, number> = { roman: 1, egyptian: 2, asian: 3, amazon: 4 };

export type MovableClip = {
  civ: Civ;
  type: string;
  action: string;
  material: string;
  direction: string;
  file: number;
  sequence: number;
  start: number;
  duration: number;
};

const LINE_RE =
  /^\s*([\w*]+)\s*,\s*([\w*]+)\s*,\s*([\w*]+)\s*,\s*([\w*]+)\s*=\s*(c?\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(-?\d+)\s*$/;

type Template = { args: string[]; lines: string[] };

function parseTemplateDecl(decl: string): string[] {
  const args: string[] = [];
  let lastSpace = 0;
  while (decl.charAt(lastSpace + 1) !== "{") {
    const nextSpace = decl.indexOf(" ", lastSpace + 1);
    args.push(decl.slice(lastSpace + 1, nextSpace));
    lastSpace = nextSpace;
  }
  return args;
}

function evalExpr(expr: string): string {
  const m = /^\s*(-?\d+)\s*([+\-*/%])\s*(-?\d+)\s*$/.exec(expr);
  if (!m) return "";
  const a = Number(m[1]);
  const b = Number(m[3]);
  switch (m[2]) {
    case "+":
      return String(a + b);
    case "-":
      return String(a - b);
    case "*":
      return String(a * b);
    case "/":
      return String((a / b) | 0);
    case "%":
      return String(a % b);
    default:
      return "";
  }
}

function applyArgs(vars: Map<string, string>, template: string): string {
  let out = template;
  for (const [k, v] of vars) out = out.split(`$${k}`).join(v);
  return out;
}

function invoke(tpl: Template, call: string, emit: (line: string) => void): void {
  const vars = new Map<string, string>();
  let last = 0;
  let i = 0;
  while (call.charAt(last) !== ")") {
    let next = call.indexOf(",", last + 1);
    if (next < 0) next = call.indexOf(")");
    vars.set(tpl.args[i]!, call.slice(last + 1, next).trim());
    i++;
    last = next;
  }
  for (const raw of tpl.lines) {
    const line = applyArgs(vars, raw);
    if (line.startsWith("%")) {
      const [target, expr] = line.slice(1).split("=");
      vars.set(target!.trim(), evalExpr(applyArgs(vars, expr ?? "")));
    } else {
      emit(line);
    }
  }
}

function expandFile(spec: string, civ: Civ): number {
  const n = civ === "shared" ? 1 : CIV_FILE[civ];
  return Number(spec.includes("c") ? spec.replace("c", String(n)) : spec);
}

function civsFor(fileSpec: string, civ: Civ | null): Civ[] {
  if (civ) return [civ];
  if (fileSpec.includes("c")) return CIVS;
  return [civFromFile(Number(fileSpec)) ?? "shared"];
}

function parseAssignments(text: string, emit: (line: string) => void, templates: Map<string, Template>): void {
  let current: Template | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("}")) {
      current = null;
      continue;
    }
    if (line.startsWith("!")) {
      const sp = line.indexOf(" ");
      const name = line.slice(1, sp);
      current = { args: parseTemplateDecl(line.slice(sp)), lines: [] };
      templates.set(name, current);
      continue;
    }
    const sink = current ? (s: string) => current!.lines.push(s) : emit;
    if (line.includes("(")) {
      const paren = line.indexOf("(");
      const tpl = templates.get(line.slice(0, paren));
      if (tpl) invoke(tpl, line.slice(paren), sink);
    } else {
      sink(line);
    }
  }
}

const ACTION_NAME: Record<string, string> = {
  NO_ACTION: "idle",
  WALKING: "walk",
  ACTION1: "action1",
  ACTION2: "action2",
  ACTION3: "action3",
  BEND_DOWN: "bend",
  RAISE_UP: "raise",
  HOMELESS1: "homeless1",
  HOMELESS2: "homeless2",
  HOMELESS3: "homeless3",
  HOMELESS4: "homeless4",
  HOMELESS_IDLE: "homeless-idle",
  "*": "any",
};

const DIR_NAME: Record<string, string> = {
  NORTH_EAST: "ne",
  EAST: "e",
  SOUTH_EAST: "se",
  SOUTH_WEST: "sw",
  WEST: "w",
  NORTH_WEST: "nw",
};

function slug(s: string): string {
  return s.toLowerCase().replace(/_/g, "-");
}

export function clipPath(clip: MovableClip): string {
  const mat = clip.material === "NO_MATERIAL" || clip.material === "*" ? "none" : slug(clip.material);
  const action = ACTION_NAME[clip.action] ?? slug(clip.action);
  const dir = DIR_NAME[clip.direction] ?? slug(clip.direction);
  return `settlers/${clip.civ}/${slug(clip.type)}/${action}/${mat}/${dir}`;
}

export function parseMovablesText(
  text: string,
  civ: Civ | null,
  templates: Map<string, Template> = new Map(),
): MovableClip[] {
  const out: MovableClip[] = [];
  parseAssignments(text, (line) => {
    const m = LINE_RE.exec(line);
    if (!m) return;
    const type = m[1]!;
    if (type === "*") return;
    const action = m[2]!;
    const material = m[3]!;
    const direction = m[4]!;
    const fileSpec = m[5]!;
    const sequence = Number(m[6]);
    const start = Number(m[7]);
    const duration = Number(m[8]);
    for (const c of civsFor(fileSpec, civ)) {
      if (direction === "*") {
        for (const d of Object.keys(DIR_NAME)) {
          out.push({
            civ: c,
            type,
            action,
            material,
            direction: d,
            file: expandFile(fileSpec, c),
            sequence,
            start,
            duration,
          });
        }
      } else {
        out.push({
          civ: c,
          type,
          action,
          material,
          direction,
          file: expandFile(fileSpec, c),
          sequence,
          start,
          duration,
        });
      }
    }
  }, templates);
  return out;
}

export function framesOf(clip: MovableClip): number[] {
  const d = clip.duration;
  if (d === 0) return [clip.start];
  if (d > 0) return Array.from({ length: d }, (_, i) => clip.start + i);
  return Array.from({ length: -d }, (_, i) => clip.start - i);
}

export async function parseMovablesFile(
  path: string,
  civ: Civ | null,
  templates: Map<string, Template> = new Map(),
): Promise<MovableClip[]> {
  return parseMovablesText(await readFile(path, "utf8"), civ, templates);
}

function civFromFile(file: number): Civ | null {
  const n = Math.floor(file / 10);
  return n === 1 ? "roman" : n === 2 ? "egyptian" : n === 3 ? "asian" : n === 4 ? "amazon" : null;
}

export async function loadAllMovableClips(dir: string): Promise<MovableClip[]> {
  const { join } = await import("node:path");
  const templates = new Map<string, Template>();
  const all = await parseMovablesFile(join(dir, "movables.txt"), null, templates);
  for (const civ of CIVS) {
    all.push(...(await parseMovablesFile(join(dir, `movables-${civ.toUpperCase()}.txt`), civ, templates)));
  }
  return all;
}
