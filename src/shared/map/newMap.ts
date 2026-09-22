import {weatherPreset, type WeatherSettings} from '../landscape/weather';
import {biomeById, type MapSize} from '../../content/biomes';
import {emptyUtcMap, type UtcMap} from './utcmap';
export function createBiomeMap(name: string, size: MapSize, biomeId: string, weather?: WeatherSettings['kind']): UtcMap {
  const biome = biomeById(biomeId);
  return {...emptyUtcMap(size), name: name.trim() || 'Untitled', biome: biome.id,
    landscape: {strokes: [], cover: [], environment: {...structuredClone(biome.environment), ...(weather ? {weather: weatherPreset(weather)} : {})}},
    authoring: {version: 1, layers: [], objects: []}};
}
