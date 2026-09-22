import {WEATHER_CHOICES, type WeatherSettings} from '../../shared/landscape/weather';
import {BIOMES, MAP_DIMENSIONS, type MapSize} from '../../content/biomes';
import {createBiomeMap} from '../../shared/map/newMap';
import type {UtcMap} from '../../shared/map/utcmap';

/** A new document always starts from an explicit, coherent biome. */
export function newMapDialog(host: HTMLElement): Promise<UtcMap | undefined> {
  return new Promise(resolve => {
    const backdrop = document.createElement('div');
    backdrop.className = 'biome-dialog-backdrop';
    const form = document.createElement('form');
    form.className = 'biome-dialog';
    form.setAttribute('role', 'dialog');
    form.setAttribute('aria-modal', 'true');
    form.setAttribute('aria-label', 'Create map');
    const heading = document.createElement('h2'); heading.textContent = 'Create a world';
    const field = (title: string, input: HTMLElement) => {
      const label = document.createElement('label'); label.append(title, input); return label;
    };
    const name = document.createElement('input'); name.name = 'name'; name.required = true;
    name.placeholder = 'Map name'; name.maxLength = 120; name.setAttribute('aria-label', 'Map name');
    const size = document.createElement('select'); size.setAttribute('aria-label', 'Map dimensions');
    MAP_DIMENSIONS.forEach(d => size.add(new Option(`${d.name} · ${d.size} × ${d.size}`, String(d.size))));
    const biome = document.createElement('select'); biome.setAttribute('aria-label', 'Biome');
    BIOMES.forEach(b => biome.add(new Option(b.name, b.id)));
    const weather=document.createElement('select');weather.setAttribute('aria-label','Weather');
    WEATHER_CHOICES.forEach(w=>weather.add(new Option(w.name,w.kind)));
    const description = document.createElement('p');
    const update = () => {const b=BIOMES.find(b => b.id === biome.value)!; description.textContent=b.description;weather.value=b.environment.weather?.kind??'clear';};
    biome.onchange = update; update();
    const note = document.createElement('p'); note.textContent = 'Start with bare ground and two player starts. Paint foliage, draw watercourses and shape the landscape in the editor.';
    const actions = document.createElement('div'); actions.className = 'scene-actions';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel';
    const create = document.createElement('button'); create.type = 'submit'; create.textContent = 'Create map';
    const close = (map?: UtcMap) => {window.removeEventListener('keydown', escape); backdrop.remove(); resolve(map);};
    const escape = (e: KeyboardEvent) => {if (e.key === 'Escape') {e.preventDefault(); e.stopImmediatePropagation(); close();}};
    window.addEventListener('keydown', escape, false);
    cancel.onclick = () => close();
    form.onsubmit = e => {e.preventDefault(); if(form.reportValidity()) close(createBiomeMap(name.value, Number(size.value) as MapSize, biome.value, weather.value as WeatherSettings['kind']));};
    actions.append(cancel, create);
    form.append(heading, field('Name', name), field('Dimensions', size), field('Biome', biome), description, field('Weather', weather), note, actions);
    backdrop.append(form);host.append(backdrop);name.focus();
  });
}
