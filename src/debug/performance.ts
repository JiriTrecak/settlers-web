import {shortcuts,inputCaptured} from '../shared/input/shortcuts';
export type MatchDebugControls = {
  reveal: boolean;
  speed: number;
  remote: boolean;
  visionPlayer: number;
  players: readonly { player: number; name?: string }[];
  onReveal(value: boolean): void;
  onSpeed(value: number): void;
  onVision(player: number): void;
};
/** Opt-in profiler. CPU scopes overlap; GPU samples arrive asynchronously. */
class PerformanceDebug {
  enabled = false;
  private matchControls: MatchDebugControls | null = null;
  private controls: HTMLElement | null = null;
  bindMatch(controls: MatchDebugControls): () => void {
    this.matchControls = controls;
    this.renderControls();
    return () => {
      if (this.matchControls === controls) {
        this.matchControls = null;
        this.controls?.remove();
        this.controls = null;
      }
    };
  }
  private renderControls() {
    this.controls?.remove();
    this.controls = null;
    const spec = this.matchControls;
    if (!this.panel || !spec) return;
    const box = document.createElement("section");
    this.controls = box;
    box.setAttribute("aria-label", "Match debug controls");
    box.style.cssText =
      "background:#10191af2;border:1px solid #53676b;padding:10px 12px;margin-top:5px;display:grid;gap:8px";
    const reveal = document.createElement("label"),
      check = document.createElement("input");
    check.type = "checkbox";
    check.checked = spec.reveal;
    check.disabled = spec.remote;
    check.onchange = () => {
      spec.reveal = check.checked;
      spec.onReveal(check.checked);
    };
    reveal.append(check, " Reveal map (visual only)");
    const speed = document.createElement("label"),
      select = document.createElement("select");
    select.setAttribute("aria-label", "Match speed");
    for (const n of [1, 2, 3, 4]) {
      const o = document.createElement("option");
      o.value = String(n);
      o.textContent = n + "×";
      select.append(o);
    }
    select.value = String(spec.speed);
    select.disabled = spec.remote;
    select.onchange = () => {
      spec.speed = Number(select.value);
      spec.onSpeed(spec.speed);
    };
    speed.append("Match speed  ", select);
    const vision = document.createElement("label"),
      players = document.createElement("select");
    players.setAttribute("aria-label", "Fog perspective");
    for (const p of spec.players) {
      const o = document.createElement("option");
      o.value = String(p.player);
      o.textContent = "Player " + (p.player + 1);
      players.append(o);
    }
    players.value = String(spec.visionPlayer);
    players.disabled = spec.remote;
    players.onchange = () => {
      spec.visionPlayer = Number(players.value);
      spec.onVision(spec.visionPlayer);
    };
    vision.append("Fog perspective  ", players);
    const hint = document.createElement("small");
    hint.textContent = spec.remote
      ? "Network matches use synchronized speed and player vision."
      : "AI vision is unchanged. Uncheck Reveal map to use the selected perspective.";
    hint.style.cssText = "max-width:340px;color:#9ab0ab;line-height:1.4";
    box.append(reveal, speed, vision, hint);
    this.text?.before(box);
    this.visibility();
  }

  private rows = new Map<string, number[]>();
  private values: Record<string, string | number> = {};
  private panel: HTMLDivElement | null = null;
  private text: HTMLPreElement | null = null;
  private counts: Record<string, number> = {};
  resetCounts() {
    if (this.enabled) {
      for (const name of Object.keys(this.counts)) this.values[name] = 0;
      this.counts = {};
    }
  }
  count(name: string, value: number) {
    if (this.enabled) this.counts[name] = (this.counts[name] ?? 0) + value;
  }
  finishCounts() {
    if (this.enabled)
      for (const [k, v] of Object.entries(this.counts))
        this.values[k] = Math.round(v).toLocaleString();
  }
  private last = 0;
  private lastFrame = 0;
  private refs = 0;
  private key = (e: KeyboardEvent) => {
    if (!inputCaptured(e) && !e.repeat && shortcuts.matches("debug.toggle",e)) {
      e.preventDefault();
      this.toggle();
    }
  };
  attach() {
    if (this.refs++ > 0) return;
    try {
      this.enabled =
        localStorage.getItem("utc.debug.performance") === "true" ||
        new URLSearchParams(location.search).has("debug");
    } catch {}
    const root = document.createElement("div");
    this.panel = root;
    root.style.cssText =
      "position:fixed;right:12px;top:48px;z-index:10000;color:#dce8e9;font:12px/1.5 monospace;pointer-events:auto";
    const toggle = document.createElement("button");
    toggle.textContent = "Debug";
    toggle.onclick = () => this.toggle();
    toggle.style.cssText =
      "padding:5px 9px;color:#dce8e9;background:#182628;border:1px solid #53676b;cursor:pointer";
    const copy = document.createElement("button");
    copy.textContent = "Copy report";
    copy.style.cssText = toggle.style.cssText;
    copy.onclick = () => {
      void navigator.clipboard
        .writeText(JSON.stringify(this.report(), null, 2))
        .then(
          () => {
            copy.textContent = "Copied";
          },
          () => {
            copy.textContent = "Copy unavailable";
          },
        );
    };
    this.text = document.createElement("pre");
    this.text.style.cssText =
      "background:#10191aee;border:1px solid #53676b;padding:12px;margin:5px 0;max-height:70vh;overflow:auto;min-width:350px;white-space:pre";
    root.append(toggle, copy, this.text);
    if (
      location.pathname.endsWith("reference-stage.html") &&
      !new URLSearchParams(location.search).has("debug")
    )
      root.hidden = true;
    document.body.append(root);
    window.addEventListener("keydown", this.key);
    this.renderControls();
    this.visibility();
    Object.assign(window, { utcPerformance: this });
  }
  detach() {
    if (--this.refs > 0) return;
    this.panel?.remove();
    this.panel = null;
    this.text = null;
    this.controls = null;
    window.removeEventListener("keydown", this.key);
    this.rows.clear();
    this.values = {};
    this.lastFrame = 0;
  }
  toggle() {
    this.enabled = !this.enabled;
    this.rows.clear();
    this.lastFrame = 0;
    try {
      localStorage.setItem("utc.debug.performance", String(this.enabled));
    } catch {}
    this.visibility();
  }
  private visibility() {
    if (this.controls)
      this.controls.style.display = this.enabled ? "grid" : "none";
    if (this.text) this.text.hidden = !this.enabled;
    if (this.panel)
      (this.panel.children[1] as HTMLElement).hidden = !this.enabled;
  }
  start() {
    return this.enabled ? performance.now() : 0;
  }
  end(name: string, start: number) {
    if (this.enabled && start) this.sample(name, performance.now() - start);
  }
  sample(name: string, ms: number) {
    if (!this.enabled) return;
    const a = this.rows.get(name) ?? [];
    a.push(ms);
    if (a.length > 120) a.shift();
    this.rows.set(name, a);
  }
  value(name: string, value: string | number) {
    if (this.enabled) this.values[name] = value;
  }
  report() {
    return {
      note: "CPU scopes overlap; GPU is asynchronous. Timings are milliseconds over the last 120 samples. Counters describe the last frame; category triangles cover color passes, while total triangles include shadows and reflections.",
      values: this.values,
      timings: Object.fromEntries(
        [...this.rows].map(([k, a]) => {
          const b = a.slice().sort((x, y) => x - y);
          return [
            k,
            {
              mean: a.reduce((s, v) => s + v, 0) / a.length,
              p95: b[Math.ceil(b.length * 0.95) - 1],
              max: b[b.length - 1],
              samples: b.length,
            },
          ];
        }),
      ),
    };
  }
  frame(now: number) {
    if (!this.enabled) return;
    if (this.lastFrame && now > this.lastFrame)
      this.sample("Frame interval", now - this.lastFrame);
    this.lastFrame = now;
    if (now - this.last < 500 || !this.text) return;
    this.last = now;
    const r = this.report();
    const frame = r.timings["Frame interval"];
    this.text.textContent =
      `PERFORMANCE  ${frame ? (1000 / frame.mean).toFixed(1) + " FPS" : ""}\n120 FPS budget: 8.33 ms\nCPU scopes overlap • mean / p95 ms\n` +
      Object.entries(r.timings)
        .map(
          ([k, v]) =>
            `${k.padEnd(25)} ${v.mean.toFixed(2).padStart(7)} / ${v.p95!.toFixed(2)}`,
        )
        .join("\n") +
      "\n\n" +
      Object.entries(r.values)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n");
  }
}
export const perf = new PerformanceDebug();
