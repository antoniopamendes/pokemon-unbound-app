import type { EvoTreeNode, StatSpread } from "./types";

// Shared build/nature/stat-spread helpers used by both the main app (editing
// existing owned Pokémon profiles) and the Pokedex Boxes "add new" flow
// (creating owned Pokémon profiles when placing a caught species into a slot).

export const BUILD_STATS: Array<{ key: keyof StatSpread; label: string }> = [
  { key: "hp", label: "HP" },
  { key: "attack", label: "Atk" },
  { key: "defense", label: "Def" },
  { key: "spAttack", label: "SpA" },
  { key: "spDefense", label: "SpD" },
  { key: "speed", label: "Spe" },
];

export const STAT_LABEL: Record<keyof StatSpread, string> = {
  hp: "HP",
  attack: "Atk",
  defense: "Def",
  spAttack: "SpA",
  spDefense: "SpD",
  speed: "Spe",
};

export type NatureOption = {
  name: string;
  up: keyof StatSpread | null;
  down: keyof StatSpread | null;
};

export const NATURES: NatureOption[] = [
  { name: "Hardy", up: null, down: null },
  { name: "Lonely", up: "attack", down: "defense" },
  { name: "Brave", up: "attack", down: "speed" },
  { name: "Adamant", up: "attack", down: "spAttack" },
  { name: "Naughty", up: "attack", down: "spDefense" },
  { name: "Bold", up: "defense", down: "attack" },
  { name: "Docile", up: null, down: null },
  { name: "Relaxed", up: "defense", down: "speed" },
  { name: "Impish", up: "defense", down: "spAttack" },
  { name: "Lax", up: "defense", down: "spDefense" },
  { name: "Timid", up: "speed", down: "attack" },
  { name: "Hasty", up: "speed", down: "defense" },
  { name: "Serious", up: null, down: null },
  { name: "Jolly", up: "speed", down: "spAttack" },
  { name: "Naive", up: "speed", down: "spDefense" },
  { name: "Modest", up: "spAttack", down: "attack" },
  { name: "Mild", up: "spAttack", down: "defense" },
  { name: "Quiet", up: "spAttack", down: "speed" },
  { name: "Bashful", up: null, down: null },
  { name: "Rash", up: "spAttack", down: "spDefense" },
  { name: "Calm", up: "spDefense", down: "attack" },
  { name: "Gentle", up: "spDefense", down: "defense" },
  { name: "Sassy", up: "spDefense", down: "speed" },
  { name: "Careful", up: "spDefense", down: "spAttack" },
  { name: "Quirky", up: null, down: null },
];

export const NATURE_BY_NAME = new Map(NATURES.map((nature) => [nature.name, nature] as const));

export function formatNatureLabel(name: string): string {
  const nature = NATURE_BY_NAME.get(name);
  if (!nature || !nature.up || !nature.down) {
    return `${name} (neutral)`;
  }
  return `${name} (+${STAT_LABEL[nature.up]}, -${STAT_LABEL[nature.down]})`;
}

export function emptySpread(defaultValue: number): StatSpread {
  return {
    hp: defaultValue,
    attack: defaultValue,
    defense: defaultValue,
    spAttack: defaultValue,
    spDefense: defaultValue,
    speed: defaultValue,
  };
}

export function sumSpread(spread: StatSpread): number {
  return BUILD_STATS.reduce((sum, stat) => sum + spread[stat.key], 0);
}

/** Returns the unique path of species from the evolution tree root down to `target` (inclusive), or just [target] if not found. */
export function findAncestorPath(root: EvoTreeNode | null, target: string): string[] {
  if (!root) return [target];
  const search = (node: EvoTreeNode, acc: string[]): string[] | null => {
    const next = [...acc, node.species];
    if (node.species === target) return next;
    for (const child of node.children) {
      const found = search(child, next);
      if (found) return found;
    }
    return null;
  };
  return search(root, []) ?? [target];
}

export function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
