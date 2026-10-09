import type {Rules, RaceDefinition} from './schema.ts';

type RaceRules = Pick<Rules, 'races' | 'defaultRace' | 'startingSetup' | 'ai'>;
export type ResolvedRace = Omit<RaceDefinition, 'startingSetup' | 'ai'> & {
 startingSetup: Rules['startingSetup'];
 ai: Pick<Rules['ai'], 'composition' | 'skillPreference'>;
};

/** Default race inherits the shared starting/AI defaults; other races may override their roster-specific parts. */
export function raceDefinition(rules: RaceRules, id?: string): ResolvedRace {
 const key = id ?? rules.defaultRace, race = rules.races[key];
 if (!race && (key !== rules.defaultRace || Object.keys(rules.races).length)) {
  throw Error(`Unknown race: ${key}`);
 }
 return {
  ...race,
  name: race?.name ?? key,
  description: race?.description ?? '',
  roster: race?.roster ?? [],
  startingSetup: race?.startingSetup ?? rules.startingSetup,
  ai: race?.ai ?? {
   composition: rules.ai.composition,
   skillPreference: rules.ai.skillPreference,
  },
 };
}

export function raceAI(rules: Rules, id?: string) {
 return {...rules.ai, ...raceDefinition(rules, id).ai};
}
