import {type WeatherSettings} from '../landscape/weather';
import {biomeById, type MapSize} from '../../content/biomes';
import {emptyUtcMap, type UtcMap} from './utcmap';
export function createBiomeMap(name: string, size: MapSize, biomeId: string, weather?: WeatherSettings['kind']): UtcMap {
  const biome = biomeById(biomeId);
  return {...emptyUtcMap(size), name: name.trim() || 'Untitled', biome: biome.id,
    landscape: {strokes: [], cover: [], environment: {hour:biome.environment.hour,playing:biome.environment.playing,...(weather?{weather:{kind:weather}}:{})}},
    authoring: {version: 1, layers: [], objects: []}};
}
