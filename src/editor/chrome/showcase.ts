import { parseUtcMap, type UtcMap } from '../../shared';
import { btn, sheet } from '../../ui';
const maps = import.meta.glob('../../../assets/maps/showcase/*.utcmap', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>;
/** Bundled editable landscapes; loaded lazily so the map data stays out of startup. */
export function showcasePicker(host: HTMLElement, open: (map: UtcMap) => void): HTMLElement {
  const root = document.createElement('div');
  root.className = `pointer-events-auto absolute right-4 bottom-4 flex gap-2 rounded-2xl p-2 ${sheet}`;
  root.setAttribute('aria-label', 'Example landscapes');
  for (const [path, load] of Object.entries(maps)) {
    const button = document.createElement('button');
    button.className = btn;
    button.textContent = path.includes('Willow') ? 'Willow Crossing' : 'Frostfall Ruins';
    button.onclick = async () => {
      button.disabled = true;
      try { const map = parseUtcMap(JSON.parse(await load())); if (map) open(map); }
      finally { button.disabled = false; }
    };
    root.append(button);
  }
  host.append(root);
  return root;
}
