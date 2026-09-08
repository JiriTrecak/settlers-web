import { type UtcMap } from '../../shared';
import { authoredMaps } from '../../shared/map/library';
import { btn, sheet } from '../../ui';
/** Bundled editable landscapes; loaded lazily so the map data stays out of startup. */
export function showcasePicker(host: HTMLElement, open: (map: UtcMap) => void): HTMLElement {
  const root = document.createElement('div');
  root.className = `pointer-events-auto absolute right-4 bottom-4 flex max-w-[calc(100%-7rem)] flex-wrap justify-end gap-2 rounded-2xl p-2 ${sheet}`;
  root.setAttribute('aria-label', 'Example landscapes');
  for (const entry of authoredMaps()) {
    const button = document.createElement('button');
    button.className = btn;
    button.textContent = entry.name;
    button.onclick = async () => {
      button.disabled = true;
      try { open(entry.map); }
      finally { button.disabled = false; }
    };
    root.append(button);
  }
  const compare=document.createElement('a');compare.className=btn;compare.textContent='Compare reference';compare.href='./visual-compare.html';compare.target='_blank';compare.rel='noopener';root.append(compare);
  host.append(root);
  return root;
}
