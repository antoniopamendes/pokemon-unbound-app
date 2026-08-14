// Standard (Gen 6+) type effectiveness chart. Keys/values use the same "TYPE_X" tokens as
// typeColors.ts. Only non-neutral matchups are listed; anything absent defaults to 1x.
export const ALL_TYPES = [
  "TYPE_NORMAL",
  "TYPE_FIRE",
  "TYPE_WATER",
  "TYPE_ELECTRIC",
  "TYPE_GRASS",
  "TYPE_ICE",
  "TYPE_FIGHTING",
  "TYPE_POISON",
  "TYPE_GROUND",
  "TYPE_FLYING",
  "TYPE_PSYCHIC",
  "TYPE_BUG",
  "TYPE_ROCK",
  "TYPE_GHOST",
  "TYPE_DRAGON",
  "TYPE_DARK",
  "TYPE_STEEL",
  "TYPE_FAIRY",
] as const;

// TYPE_CHART[attackingType][defendingType] = damage multiplier.
const TYPE_CHART: Record<string, Record<string, number>> = {
  TYPE_NORMAL: { TYPE_ROCK: 0.5, TYPE_STEEL: 0.5, TYPE_GHOST: 0 },
  TYPE_FIRE: {
    TYPE_FIRE: 0.5, TYPE_WATER: 0.5, TYPE_GRASS: 2, TYPE_ICE: 2, TYPE_BUG: 2,
    TYPE_ROCK: 0.5, TYPE_DRAGON: 0.5, TYPE_STEEL: 2,
  },
  TYPE_WATER: { TYPE_FIRE: 2, TYPE_WATER: 0.5, TYPE_GRASS: 0.5, TYPE_GROUND: 2, TYPE_ROCK: 2, TYPE_DRAGON: 0.5 },
  TYPE_ELECTRIC: {
    TYPE_WATER: 2, TYPE_ELECTRIC: 0.5, TYPE_GRASS: 0.5, TYPE_GROUND: 0, TYPE_FLYING: 2, TYPE_DRAGON: 0.5,
  },
  TYPE_GRASS: {
    TYPE_FIRE: 0.5, TYPE_WATER: 2, TYPE_GRASS: 0.5, TYPE_POISON: 0.5, TYPE_GROUND: 2, TYPE_FLYING: 0.5,
    TYPE_BUG: 0.5, TYPE_ROCK: 2, TYPE_DRAGON: 0.5, TYPE_STEEL: 0.5,
  },
  TYPE_ICE: {
    TYPE_FIRE: 0.5, TYPE_WATER: 0.5, TYPE_GRASS: 2, TYPE_ICE: 0.5, TYPE_GROUND: 2, TYPE_FLYING: 2,
    TYPE_DRAGON: 2, TYPE_STEEL: 0.5,
  },
  TYPE_FIGHTING: {
    TYPE_NORMAL: 2, TYPE_ICE: 2, TYPE_POISON: 0.5, TYPE_FLYING: 0.5, TYPE_PSYCHIC: 0.5, TYPE_BUG: 0.5,
    TYPE_ROCK: 2, TYPE_GHOST: 0, TYPE_DARK: 2, TYPE_STEEL: 2, TYPE_FAIRY: 0.5,
  },
  TYPE_POISON: {
    TYPE_GRASS: 2, TYPE_POISON: 0.5, TYPE_GROUND: 0.5, TYPE_ROCK: 0.5, TYPE_GHOST: 0.5, TYPE_STEEL: 0, TYPE_FAIRY: 2,
  },
  TYPE_GROUND: {
    TYPE_FIRE: 2, TYPE_ELECTRIC: 2, TYPE_GRASS: 0.5, TYPE_POISON: 2, TYPE_FLYING: 0, TYPE_BUG: 0.5,
    TYPE_ROCK: 2, TYPE_STEEL: 2,
  },
  TYPE_FLYING: {
    TYPE_ELECTRIC: 0.5, TYPE_GRASS: 2, TYPE_FIGHTING: 2, TYPE_BUG: 2, TYPE_ROCK: 0.5, TYPE_STEEL: 0.5,
  },
  TYPE_PSYCHIC: { TYPE_FIGHTING: 2, TYPE_POISON: 2, TYPE_PSYCHIC: 0.5, TYPE_DARK: 0, TYPE_STEEL: 0.5 },
  TYPE_BUG: {
    TYPE_FIRE: 0.5, TYPE_GRASS: 2, TYPE_FIGHTING: 0.5, TYPE_POISON: 0.5, TYPE_FLYING: 0.5, TYPE_PSYCHIC: 2,
    TYPE_GHOST: 0.5, TYPE_DARK: 2, TYPE_STEEL: 0.5, TYPE_FAIRY: 0.5,
  },
  TYPE_ROCK: {
    TYPE_FIRE: 2, TYPE_ICE: 2, TYPE_FIGHTING: 0.5, TYPE_GROUND: 0.5, TYPE_FLYING: 2, TYPE_BUG: 2, TYPE_STEEL: 0.5,
  },
  TYPE_GHOST: { TYPE_NORMAL: 0, TYPE_PSYCHIC: 2, TYPE_GHOST: 2, TYPE_DARK: 0.5 },
  TYPE_DRAGON: { TYPE_DRAGON: 2, TYPE_STEEL: 0.5, TYPE_FAIRY: 0 },
  TYPE_DARK: { TYPE_FIGHTING: 0.5, TYPE_PSYCHIC: 2, TYPE_GHOST: 2, TYPE_DARK: 0.5, TYPE_FAIRY: 0.5 },
  TYPE_STEEL: {
    TYPE_FIRE: 0.5, TYPE_WATER: 0.5, TYPE_ELECTRIC: 0.5, TYPE_ICE: 2, TYPE_ROCK: 2, TYPE_STEEL: 0.5, TYPE_FAIRY: 2,
  },
  TYPE_FAIRY: {
    TYPE_FIRE: 0.5, TYPE_FIGHTING: 2, TYPE_POISON: 0.5, TYPE_DRAGON: 2, TYPE_DARK: 2, TYPE_STEEL: 0.5,
  },
};

/** Damage multiplier a Pokémon with the given defending type(s) takes from each attacking type. */
export function getTypeMatchups(defendingTypes: string[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const attackType of ALL_TYPES) {
    let multiplier = 1;
    for (const defendType of defendingTypes) {
      multiplier *= TYPE_CHART[attackType]?.[defendType] ?? 1;
    }
    result[attackType] = multiplier;
  }
  return result;
}

/**
 * Applies the unconditional, type-wide defensive effects of a selected ability.
 *
 * This intentionally leaves move-specific and battle-state effects (for example
 * Wonder Guard, Bulletproof, weather abilities, and Mold Breaker interactions)
 * out of the team overview because they cannot be represented by type alone.
 */
export function getAbilityAdjustedTypeMatchups(defendingTypes: string[], ability: string): Record<string, number> {
  const result = getTypeMatchups(defendingTypes);
  const setImmunity = (type: string) => {
    result[type] = 0;
  };
  const multiply = (type: string, factor: number) => {
    result[type] = (result[type] ?? 1) * factor;
  };

  switch (ability) {
    case "ABILITY_LEVITATE":
      setImmunity("TYPE_GROUND");
      break;
    case "ABILITY_FLASH_FIRE":
      setImmunity("TYPE_FIRE");
      break;
    case "ABILITY_WATER_ABSORB":
    case "ABILITY_STORM_DRAIN":
      setImmunity("TYPE_WATER");
      break;
    case "ABILITY_DRY_SKIN":
      setImmunity("TYPE_WATER");
      multiply("TYPE_FIRE", 1.25);
      break;
    case "ABILITY_VOLT_ABSORB":
    case "ABILITY_LIGHTNING_ROD":
    case "ABILITY_MOTOR_DRIVE":
      setImmunity("TYPE_ELECTRIC");
      break;
    case "ABILITY_SAP_SIPPER":
      setImmunity("TYPE_GRASS");
      break;
    case "ABILITY_THICK_FAT":
      multiply("TYPE_FIRE", 0.5);
      multiply("TYPE_ICE", 0.5);
      break;
    case "ABILITY_HEATPROOF":
      multiply("TYPE_FIRE", 0.5);
      break;
    default:
      break;
  }

  return result;
}

export type TypeMatchupBuckets = {
  quadWeak: string[];
  weak: string[];
  resist: string[];
  quadResist: string[];
  immune: string[];
};

/** Splits a matchup map into readable buckets (4x/2x weak, 0.5x/0.25x resist, 0x immune). */
export function bucketizeMatchups(matchups: Record<string, number>): TypeMatchupBuckets {
  const buckets: TypeMatchupBuckets = { quadWeak: [], weak: [], resist: [], quadResist: [], immune: [] };
  for (const type of ALL_TYPES) {
    const multiplier = matchups[type] ?? 1;
    if (multiplier === 0) buckets.immune.push(type);
    else if (multiplier >= 4) buckets.quadWeak.push(type);
    else if (multiplier > 1) buckets.weak.push(type);
    else if (multiplier <= 0.25) buckets.quadResist.push(type);
    else if (multiplier < 1) buckets.resist.push(type);
  }
  return buckets;
}
