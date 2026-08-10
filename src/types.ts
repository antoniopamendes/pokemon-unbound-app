export type PokemonEntry = {
  id: string;
  displayName: string;
  rawKey: string;
  speciesNumber: number;
  dexOrder: number;
};

export type PokemonStats = {
  hp: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  speed: number;
  total: number;
};

export type StatSpread = {
  hp: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  speed: number;
};

export type PokemonMoveLearn = {
  move: string;
  level: number;
};

export type PokemonEvolution = {
  method: string;
  condition: string;
  target: string;
};

export type EvoTreeNode = {
  species: string;
  method: string;      // how this species is reached from its parent (empty for root)
  condition: string;
  children: EvoTreeNode[];
};

export type PokemonLocation = {
  mapName: string;
  method: string;
  minLevel: number;
  maxLevel: number;
};

export type PokemonDetails = {
  speciesKey: string;
  types: string[];
  stats: PokemonStats;
  abilities: string[];
  heldItems: string[];
  levelUpMoves: PokemonMoveLearn[];
  eggMoves: string[];
  evolutions: EvoTreeNode | null;  // root of the evolution tree (null = no data)
  locations: PokemonLocation[];
  spriteUrl: string;
};

export type MoveInfo = {
  key: string;
  name: string;
  type: string;
  split: string;
  power: number;
  accuracy: number;
  pp: number;
  effect: string;
  description: string;
};

export type AbilityInfo = {
  key: string;
  name: string;
  description: string;
};

export type ItemInfo = {
  key: string;
  name: string;
  description: string;
};

export type UnboundDataset = {
  pokemon: Record<string, PokemonDetails>;
  moves: Record<string, MoveInfo>;
  abilities: Record<string, AbilityInfo>;
  items: Record<string, ItemInfo>;
};

export type PokemonBuild = {
  id: string;
  name: string;
  nature: string;
  ability: string;
  item: string;
  evs: StatSpread;
  ivs: StatSpread;
  moveset: string[];
  createdAt: string;
};

export type BuildMap = Record<string, PokemonBuild[]>;

export type CaughtPokemonProfile = {
  id: string;
  originalSpecies: string;
  currentSpecies: string;
  level: number;
  nature: string;
  ability: string;
  item: string;
  evs: StatSpread;
  ivs: StatSpread;
  moveset: string[];
  updatedAt: string;
};

export type CaughtPokemonMap = Record<string, CaughtPokemonProfile[]>;
