import type { SkyState } from '../sky/sky';

export function clockDisplay(hour: number): { time: string; day: boolean; progress: number } {
  const h = ((Number.isFinite(hour) ? hour : 0) % 24 + 24) % 24;
  const minutes = Math.floor(h * 60 + 1e-8) % 1440;
  return { time: `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`, day: h >= 6 && h < 18, progress: h / 24 };
}

/** Fits wholly inside the diamond minimap's unused upper-left triangle. */
export class DayNightIndicator {
  readonly root = document.createElement('div');
  private readonly sun: SVGElement;
  private readonly moon: SVGElement;
  private readonly ring: SVGElement;
  private readonly time: HTMLElement;
  private last = '';

  constructor(host: HTMLElement) {
    this.root.style.cssText = 'position:absolute;left:2px;top:2px;width:60px;height:72px;pointer-events:auto;text-align:center;color:#f8e7bd;cursor:default;';
    this.root.setAttribute('role', 'img');
    this.root.innerHTML = `<svg width="60" height="56" viewBox="0 0 60 56" aria-hidden="true" style="display:block;filter:drop-shadow(0 2px 5px #0008)">
      <circle cx="30" cy="28" r="25" fill="#171e2bef" stroke="#e6d3a333"/>
      <circle cx="30" cy="28" r="22" fill="none" stroke="#b5c6df25" stroke-width="2"/>
      <circle data-ring cx="30" cy="28" r="22" pathLength="1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" transform="rotate(-90 30 28)"/>
      <g data-sun fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="30" cy="28" r="7" fill="#efbc5433"/><path d="M30 14v3m0 22v3M16 28h3m22 0h3M20 18l2 2m16 16 2 2M20 38l2-2m16-16 2-2"/></g>
      <g data-moon fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M32 16a12 12 0 1 0 10 17A12 12 0 0 1 32 16Z" fill="#b4ceff22"/><path d="M40 17v5m-2.5-2.5h5M44 26v2m-1-1h2"/></g>
    </svg><span data-time style="display:block;font:600 11px/14px system-ui,sans-serif;font-variant-numeric:tabular-nums;letter-spacing:.06em;text-shadow:0 1px 3px #000,0 0 5px #000;">00:00</span>`;
    this.sun = this.root.querySelector('[data-sun]')!;
    this.moon = this.root.querySelector('[data-moon]')!;
    this.ring = this.root.querySelector('[data-ring]')!;
    this.time = this.root.querySelector('[data-time]')!;
    host.append(this.root);
  }

  update(state: SkyState): void {
    const view = clockDisplay(state.hour), key = `${view.time}/${state.playing}/${state.label}`;
    if (key === this.last) return;
    this.last = key;
    this.root.style.color = view.day ? '#f4ce82' : '#bed6ff';
    this.sun.style.display = view.day ? '' : 'none';
    this.moon.style.display = view.day ? 'none' : '';
    this.ring.setAttribute('stroke-dasharray', `${view.progress} 1`);
    this.time.textContent = view.time;
    const label = `${state.label} · ${view.time}${state.playing ? '' : ' · Paused'}`;
    this.root.title = label;
    this.root.setAttribute('aria-label', label);
  }
}
