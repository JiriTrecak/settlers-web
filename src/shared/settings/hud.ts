export const HUD_CHANGED = 'utc-hud-changed';
export type HudLayout = 'spread' | 'compact';
export const HUD_LAYOUT_KEY = 'utc.hud.layout';
export function readHudLayout(): HudLayout {
  try { return localStorage.getItem(HUD_LAYOUT_KEY) === 'compact' ? 'compact' : 'spread'; } catch { return 'spread'; }
}
export function setHudLayout(value: HudLayout): void {
  if (value !== 'spread' && value !== 'compact') return;
  try { localStorage.setItem(HUD_LAYOUT_KEY, value); } catch {}
  window.dispatchEvent(new Event(HUD_CHANGED));
}

export const HUD_SCALE_KEY = 'utc.hud.scale';
export const DEFAULT_HUD_SCALE = 65;
/** Percentage of the chosen dock layout; independent of game render resolution. */
export function readHudScale(): number {
  try {
    const value = Number(localStorage.getItem(HUD_SCALE_KEY));
    if (Number.isFinite(value) && value >= 30 && value <= 100) return Math.round(value);
  } catch {}
  return DEFAULT_HUD_SCALE;
}
export function setHudScale(value: number): void {
  if (!Number.isFinite(value)) return;
  const percent = Math.max(30, Math.min(100, Math.round(value)));
  try { localStorage.setItem(HUD_SCALE_KEY, String(percent)); } catch {}
  window.dispatchEvent(new Event(HUD_CHANGED));
}
