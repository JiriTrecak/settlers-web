import {shortcuts,keyLabel} from '../../shared/input/shortcuts';
import type { HeroShortcut } from '../../presentation/heroes';
import { healthPipState } from '../../presentation/health';
import { iconArt } from './commandArt';
import './heroBar.css';

/** Stable buttons preserve native double-click behavior while health/selection updates. */
export class HeroBar {
  readonly root = document.createElement('nav');
  private readonly buttons = new Map<number, {button: HTMLButtonElement; health: HTMLElement; icon: string}>();
  constructor(private readonly hooks: {select: (id: number) => void; focus: (id: number) => void}) {
    this.root.className = 'rts-hero-bar';
    this.root.setAttribute('aria-label', 'Your heroes');
  }
  update(heroes: readonly HeroShortcut[], selectedIds: readonly number[]) {
    this.root.hidden = heroes.length === 0;
    const seen = new Set(heroes.map(h => h.id));
    for (const [id, entry] of this.buttons) if (!seen.has(id)) {
      entry.button.remove(); this.buttons.delete(id);
    }
    for (const [index,hero] of heroes.entries()) {
      let entry = this.buttons.get(hero.id);
      if (!entry) {
        const button = document.createElement('button'), health = document.createElement('span');
        button.type = 'button'; button.className = 'rts-hero-shortcut';
        health.className = 'rts-hero-health'; health.setAttribute('aria-hidden', 'true');
        button.onclick = () => this.hooks.select(hero.id);
        button.ondblclick = () => this.hooks.focus(hero.id);
        entry = {button, health, icon: ''};
        this.buttons.set(hero.id, entry); this.root.append(button);
      }
      const {button, health} = entry;
      if (entry.icon !== hero.icon) {
        button.innerHTML = iconArt(hero.icon); button.append(health); entry.icon = hero.icon;
      }
      button.disabled = !hero.available;
      button.setAttribute('aria-label', `Select ${hero.name}`);
      button.setAttribute('aria-pressed', String(selectedIds.includes(hero.id)));
      button.dataset.tipName = hero.name;
      button.dataset.tipKey=keyLabel(shortcuts.key(`hero.${index+1}`));
      let key=button.querySelector('kbd');if(!key){key=document.createElement('kbd');key.style.cssText='position:absolute;right:4px;bottom:7px;color:#fff;font-size:11px;text-shadow:0 1px 3px #000;pointer-events:none';button.append(key);}key.textContent=button.dataset.tipKey;
      button.dataset.tipDescription = hero.available
        ? 'Click to select. Double-click to center the camera.'
        : hero.hp <= 0 ? 'Fallen. Revive this hero at a Sanctuary.' : 'Hero is currently unavailable.';
      health.style.setProperty('--hero-health', `${Math.max(0, Math.min(1, hero.hp / hero.maxHp)) * 100}%`);
      health.style.setProperty('--hero-health-color', `#${healthPipState(hero.hp, hero.maxHp, false).color.toString(16).padStart(6, '0')}`);
    }
  }
}
