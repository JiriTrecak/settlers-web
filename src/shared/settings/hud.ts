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
