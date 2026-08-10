import type { PokemonStats, StatSpread } from "./types";

export type NatureModifiers = {
  hp: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  speed: number;
};

export function calculateStat(
  baseStat: number,
  iv: number,
  ev: number,
  level: number,
  isStat: "hp" | "other",
  natureModifier: number = 1.0
): number {
  if (isStat === "hp") {
    return Math.floor(((2 * baseStat + iv + Math.floor(ev / 4)) * level) / 100) + level + 10;
  }
  return Math.floor((Math.floor(((2 * baseStat + iv + Math.floor(ev / 4)) * level) / 100) + 5) * natureModifier);
}

export function getNatureModifiers(
  upStat: keyof StatSpread | null,
  downStat: keyof StatSpread | null
): NatureModifiers {
  const modifiers: NatureModifiers = {
    hp: 1.0,
    attack: 1.0,
    defense: 1.0,
    spAttack: 1.0,
    spDefense: 1.0,
    speed: 1.0,
  };

  if (upStat) {
    modifiers[upStat] = 1.1;
  }
  if (downStat) {
    modifiers[downStat] = 0.9;
  }

  return modifiers;
}

export function calculateCaughtPokemonStats(
  baseStats: PokemonStats,
  level: number,
  ivs: StatSpread,
  evs: StatSpread,
  natureModifiers: NatureModifiers
): PokemonStats {
  const hp = calculateStat(baseStats.hp, ivs.hp, evs.hp, level, "hp");
  const attack = calculateStat(baseStats.attack, ivs.attack, evs.attack, level, "other", natureModifiers.attack);
  const defense = calculateStat(baseStats.defense, ivs.defense, evs.defense, level, "other", natureModifiers.defense);
  const spAttack = calculateStat(baseStats.spAttack, ivs.spAttack, evs.spAttack, level, "other", natureModifiers.spAttack);
  const spDefense = calculateStat(baseStats.spDefense, ivs.spDefense, evs.spDefense, level, "other", natureModifiers.spDefense);
  const speed = calculateStat(baseStats.speed, ivs.speed, evs.speed, level, "other", natureModifiers.speed);

  return {
    hp,
    attack,
    defense,
    spAttack,
    spDefense,
    speed,
    total: hp + attack + defense + spAttack + spDefense + speed,
  };
}
