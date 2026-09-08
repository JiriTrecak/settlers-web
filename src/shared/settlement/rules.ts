/** Gameplay rules are shared data. Changes require a new match rules revision. */
export const RULES_REVISION = "settlement-6";
export type ResourceKind = "wood" | "stone";
export type BuildingKind =
  | "barracks"
  | "fort"
  | "tower"
  | "lumberjack"
  | "sawmill"
  | "forester"
  | "stonemason"
  | "house";
export type BuildingRule = {
  name: string;
  wood: number;
  stone: number;
  work: number;
  radius: number;
  territory: number;
  job?: ResourceKind;
  population: number;
  health?: number;
  buildable?: boolean;
};
export const BUILDINGS: Record<BuildingKind, BuildingRule> = {
  barracks: { name: "Barracks", wood: 8, stone: 4, work: 240, radius: 3, territory: 0, population: 0, health: 450 },
  fort: {
    name: "Main fort",
    wood: 0,
    stone: 0,
    work: 1,
    radius: 4,
    territory: 38,
    population: 0,
    health: 1000,
    buildable: false,
  },
  sawmill: {
    name: "Sawmill",
    wood: 8,
    stone: 4,
    work: 280,
    radius: 4,
    territory: 0,
    population: 0,
  },
  forester: {
    name: "Forester lodge",
    wood: 6,
    stone: 2,
    work: 220,
    radius: 3,
    territory: 0,
    population: 0,
  },
  tower: {
    name: "Watchtower",
    wood: 10,
    stone: 8,
    work: 320,
    radius: 2,
    territory: 38,
    population: 0,
  },
  lumberjack: {
    name: "Lumberjack's hut",
    wood: 6,
    stone: 2,
    work: 200,
    radius: 3,
    territory: 0,
    job: "wood",
    population: 0,
  },
  stonemason: {
    name: "Stonemason's hut",
    wood: 6,
    stone: 2,
    work: 240,
    radius: 2,
    territory: 0,
    job: "stone",
    population: 0,
  },
  house: {
    name: "Settler house",
    wood: 8,
    stone: 4,
    work: 240,
    radius: 2,
    territory: 0,
    population: 3,
  },
};
export const BUILDING_KINDS: BuildingKind[] = [
  "barracks",
  "lumberjack",
  "sawmill",
  "forester",
  "stonemason",
  "house",
  "tower",
];
export const WORKER_STEP_TICKS = 5;
export const GATHER_TICKS = 100;
export const CARRY_CAPACITY = 4;
export const MAX_BUILDINGS = 160;
export const MAX_WORKERS = 160;

export type ItemKind = "log" | "plank" | "stone";
export type ItemStock = Record<ItemKind, number>;
export const STOCKPILE_LIMIT = 16;

export type SoldierKind = 'warrior' | 'archer';
export const SOLDIERS = {
  warrior: { name: 'Warrior', health: 120, damage: 12, range: 1.5, cooldown: 32, training: 160, planks: 1 },
  archer: { name: 'Archer', health: 70, damage: 9, range: 7, cooldown: 48, training: 240, planks: 1 },
} as const;
export const RECRUIT_QUEUE_LIMIT = 12;
export const isSoldier = (role: string): role is SoldierKind => role === 'warrior' || role === 'archer';
export const unitMaxHealth = (role: string) => isSoldier(role) ? SOLDIERS[role].health : 60;
