import { fetchWithPersistentCache, readJsonFromPersistentCache, writeJsonToPersistentCache } from "./httpCache";
import type {
  AbilityInfo,
  EvoTreeNode,
  ItemInfo,
  MoveInfo,
  PokemonDetails,
  PokemonEntry,
  PokemonEvolution,
  PokemonLocation,
  PokemonMoveLearn,
  UnboundDataset,
} from "./types";

const DATASET_CACHE_KEY = "https://unbound-tracker.local/cache/unbound-dataset-v12.json";

const SOURCES = {
  baseStats:
    "https://raw.githubusercontent.com/Skeli789/Dynamic-Pokemon-Expansion/Unbound/src/Base_Stats.c",
  learnsets:
    "https://raw.githubusercontent.com/Skeli789/Dynamic-Pokemon-Expansion/Unbound/src/Learnsets.c",
  eggMoves:
    "https://raw.githubusercontent.com/Skeli789/Dynamic-Pokemon-Expansion/Unbound/src/Egg_Moves.c",
  evolutions:
    "https://raw.githubusercontent.com/Skeli789/Dynamic-Pokemon-Expansion/Unbound/src/Evolution%20Table.c",
  frontSprites:
    "https://raw.githubusercontent.com/Skeli789/Dynamic-Pokemon-Expansion/Unbound/src/Front_Pic_Table.c",
  locations:
    "/data/pokemon_locations.json",
  movesTable:
    "https://raw.githubusercontent.com/Skeli789/Complete-Fire-Red-Upgrade/master/src/Tables/battle_moves.c",
  moveNames:
    "https://raw.githubusercontent.com/Skeli789/Complete-Fire-Red-Upgrade/master/strings/attack_name_table.string",
  moveDescriptions:
    "https://raw.githubusercontent.com/Skeli789/Complete-Fire-Red-Upgrade/master/strings/attack_descriptions.string",
  abilitiesTable:
    "https://raw.githubusercontent.com/Skeli789/Complete-Fire-Red-Upgrade/master/include/constants/abilities.h",
  abilityNames:
    "https://raw.githubusercontent.com/Skeli789/Complete-Fire-Red-Upgrade/master/strings/ability_name_table.string",
  abilityDescriptions:
    "https://raw.githubusercontent.com/Skeli789/Complete-Fire-Red-Upgrade/master/strings/ability_descriptions.string",
  itemsTable:
    "https://raw.githubusercontent.com/Skeli789/Complete-Fire-Red-Upgrade/master/include/constants/items.h",
    itemTableDetails:
      "https://raw.githubusercontent.com/Skeli789/Complete-Fire-Red-Upgrade/master/src/Tables/item_tables.c",
} as const;

type SourceBundle = {
  baseStats: string;
  learnsets: string;
  eggMoves: string;
  evolutions: string;
  frontSprites: string;
  locations: unknown;
  movesTable: string;
  moveNames: string;
  moveDescriptions: string;
  abilitiesTable: string;
  abilityNames: string;
  abilityDescriptions: string;
  itemsTable: string;
  itemTableDetails: string;
};

function formatConstantToken(raw: string): string {
  return raw
    .replace(/^(SPECIES|MOVE|ABILITY|ITEM|TYPE|SPLIT|EVO)_/, "")
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
    .replace("Ho Oh", "Ho-Oh");
}

function canonicalToken(raw: string): string {
  return raw.replace(/_/g, "").toUpperCase();
}

async function fetchText(url: string): Promise<string> {
  const response = await fetchWithPersistentCache(url);
  if (!response.ok) {
    throw new Error(`Failed to load source data (${response.status}) from ${url}`);
  }
  return response.text();
}

async function fetchJson(url: string): Promise<unknown> {
  // For local files, skip the persistent cache and fetch directly.
  const response = url.startsWith("/")
    ? await fetch(url)
    : await fetchWithPersistentCache(url);
  if (!response.ok) {
    throw new Error(`Failed to load source data (${response.status}) from ${url}`);
  }
  return response.json();
}

function parseBaseStats(text: string): Record<string, Omit<PokemonDetails, "speciesKey" | "levelUpMoves" | "eggMoves" | "evolutions" | "locations" | "spriteUrl">> {
  const results: Record<string, Omit<PokemonDetails, "speciesKey" | "levelUpMoves" | "eggMoves" | "evolutions" | "locations" | "spriteUrl">> = {};
  const blockRegex = /\[(SPECIES_[A-Z0-9_]+)\]\s*=\s*\{\n([\s\S]*?)\n\s*\},/g;

  for (const match of text.matchAll(blockRegex)) {
    const speciesKey = match[1];
    const body = match[2];

    const numberField = (name: string): number => {
      const numberMatch = body.match(new RegExp(`\\.${name}\\s*=\\s*(\\d+)`));
      return numberMatch ? Number.parseInt(numberMatch[1], 10) : 0;
    };

    const tokenField = (name: string): string => {
      const tokenMatch = body.match(new RegExp(`\\.${name}\\s*=\\s*([A-Z0-9_]+)`));
      return tokenMatch ? tokenMatch[1] : "";
    };

    const type1 = tokenField("type1");
    const type2 = tokenField("type2");
    const ability1 = tokenField("ability1");
    const ability2 = tokenField("ability2");
    const hiddenAbility = tokenField("hiddenAbility");
    const item1 = tokenField("item1");
    const item2 = tokenField("item2");

    const hp = numberField("baseHP");
    const attack = numberField("baseAttack");
    const defense = numberField("baseDefense");
    const spAttack = numberField("baseSpAttack");
    const spDefense = numberField("baseSpDefense");
    const speed = numberField("baseSpeed");

    results[speciesKey] = {
      types: [type1, type2].filter((type, index, array) => type !== "" && (index === 0 || type !== array[0])),
      stats: {
        hp,
        attack,
        defense,
        spAttack,
        spDefense,
        speed,
        total: hp + attack + defense + spAttack + spDefense + speed,
      },
      abilities: [ability1, ability2, hiddenAbility].filter(
        (ability, index, array) =>
          ability !== "" && ability !== "ABILITY_NONE" && array.indexOf(ability) === index,
      ),
      heldItems: [item1, item2].filter((item, index, array) => item !== "" && item !== "ITEM_NONE" && array.indexOf(item) === index),
    };
  }

  return results;
}

function parseLevelUpLearnsets(text: string): Record<string, PokemonMoveLearn[]> {
  const pointerToSpecies: Record<string, string[]> = {};
  const learnsetByPointer: Record<string, PokemonMoveLearn[]> = {};
  const result: Record<string, PokemonMoveLearn[]> = {};

  const pointerRegex = /\[\s*(SPECIES_[A-Z0-9_]+)\s*\]\s*=\s*(s[A-Za-z0-9_]+LevelUpLearnset)/g;
  for (const match of text.matchAll(pointerRegex)) {
    const species = match[1];
    const pointer = match[2];
    if (!pointerToSpecies[pointer]) {
      pointerToSpecies[pointer] = [];
    }
    pointerToSpecies[pointer].push(species);
  }

  const tableRegex = /static const struct LevelUpMove (s[A-Za-z0-9_]+LevelUpLearnset)\[\]\s*=\s*\{([\s\S]*?)\};/g;
  for (const match of text.matchAll(tableRegex)) {
    const pointer = match[1];
    const body = match[2];
    const learnset: PokemonMoveLearn[] = [];
    const moveRegex = /LEVEL_UP_MOVE\(\s*(\d+)\s*,\s*(MOVE_[A-Z0-9_]+)\s*\)/g;
    for (const moveMatch of body.matchAll(moveRegex)) {
      learnset.push({
        level: Number.parseInt(moveMatch[1], 10),
        move: moveMatch[2],
      });
    }
    learnsetByPointer[pointer] = learnset;
  }

  Object.entries(pointerToSpecies).forEach(([pointer, speciesList]) => {
    const learnset = learnsetByPointer[pointer] ?? [];
    speciesList.forEach((species) => {
      result[species] = learnset;
    });
  });

  return result;
}

function parseEggMoves(text: string): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const blockRegex = /egg_moves\((\w+),([\s\S]*?)\),/g;

  for (const match of text.matchAll(blockRegex)) {
    const suffix = match[1];
    const movesBlock = match[2];
    const speciesKey = `SPECIES_${suffix.toUpperCase()}`;
    const moveMatches = [...movesBlock.matchAll(/MOVE_[A-Z0-9_]+/g)].map((entry) => entry[0]);
    if (moveMatches.length > 0) {
      result[speciesKey] = moveMatches;
    }
  }

  return result;
}

function parseEvolutions(text: string): Record<string, PokemonEvolution[]> {
  const result: Record<string, PokemonEvolution[]> = {};
  const lines = text.split("\n");
  let currentSpecies = "";

  lines.forEach((line) => {
    const speciesMatch = line.match(/\[\s*(SPECIES_[A-Z0-9_]+)\s*\]/);
    if (speciesMatch) {
      currentSpecies = speciesMatch[1];
      if (!result[currentSpecies]) {
        result[currentSpecies] = [];
      }
    }

    if (!currentSpecies) {
      return;
    }

    const evoRegex = /\{(EVO_[A-Z0-9_]+)\s*,\s*([^,}]+)\s*,\s*(SPECIES_[A-Z0-9_]+)\s*,\s*([^}]+)\}/g;
    for (const match of line.matchAll(evoRegex)) {
      result[currentSpecies].push({
        method: match[1],
        condition: match[2].trim(),
        target: match[3],
      });
    }
  });

  return result;
}

function parseSprites(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = text.split("\n");

  lines.forEach((line) => {
    const speciesMatch = line.match(/\[\s*(SPECIES_[A-Z0-9_]+)\s*\]/);
    const spriteMatch = line.match(/(gFrontSprite[A-Za-z0-9_]+)Tiles/);
    if (!speciesMatch) {
      return;
    }

    const species = speciesMatch[1] === "SPECIES_ENAMORUS_T" ? "SPECIES_ENAMORUS_THERIAN" : speciesMatch[1];
    if (species === "SPECIES_SHADOW_WARRIOR") {
      result[species] =
        "https://raw.githubusercontent.com/Skeli789/Dynamic-Pokemon-Expansion/Unbound/graphics/frontspr/gSpriteShadowWarrior.png";
      return;
    }

    if (!spriteMatch) {
      return;
    }

    const spriteFile = `${spriteMatch[1]}.png`;
    if (species === "SPECIES_CASTFORM") {
      result[species] =
        "https://raw.githubusercontent.com/Skeli789/Dynamic-Pokemon-Expansion/Unbound/graphics/castform/gFrontSprite385Castform.png";
      return;
    }

    result[species] = `https://raw.githubusercontent.com/Skeli789/Dynamic-Pokemon-Expansion/Unbound/graphics/frontspr/${spriteFile}`;
  });

  return result;
}

function parseLocations(raw: unknown): Record<string, PokemonLocation[]> {
  // New format: { "Pokemon Name": [{ location, method }, ...] }
  const result: Record<string, PokemonLocation[]> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return result;

  for (const [name, entries] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(entries)) continue;
    // Key by display name — will be matched to species keys later
    result[name] = entries
      .filter((e): e is { location: string; method: string } =>
        e && typeof e === "object" && typeof e.location === "string" && typeof e.method === "string"
      )
      .map((e) => ({
        mapName: e.location,
        method: e.method,
        minLevel: 0,
        maxLevel: 0,
      }));
  }
  return result;
}

function parseMoveNames(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  const regex = /#org\s+@NAME_([A-Z0-9_]+)\n([^\n]+)/g;
  for (const match of text.matchAll(regex)) {
    const suffix = match[1];
    const displayName = match[2].trim();
    const key = `MOVE_${suffix}`;
    result[canonicalToken(key)] = displayName;
  }
  return result;
}

function parseAbilityNames(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  const regex = /#org\s+@NAME_([A-Z0-9_]+)\n([^\n]+)/g;
  for (const match of text.matchAll(regex)) {
    const suffix = match[1];
    const displayName = match[2].trim();
    const key = `ABILITY_${suffix}`;
    result[canonicalToken(key)] = displayName;
  }
  return result;
}

function parseDescriptions(text: string, prefix: "MOVE" | "ABILITY"): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = text.split("\n");
  let pendingKeys: string[] = [];
  let chosenLine = "";

  const flush = () => {
    if (!chosenLine || pendingKeys.length === 0) {
      pendingKeys = [];
      chosenLine = "";
      return;
    }

    pendingKeys.forEach((key) => {
      result[key] = chosenLine.replaceAll("\\n", " ").trim();
    });
    pendingKeys = [];
    chosenLine = "";
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    const descMatch = trimmed.match(/^#org\s+@DESC_([A-Z0-9_]+)/);
    if (descMatch) {
      if (chosenLine) {
        flush();
      }
      const key = `${prefix}_${descMatch[1]}`;
      pendingKeys.push(canonicalToken(key));
      return;
    }

    if (pendingKeys.length === 0) {
      return;
    }

    if (trimmed === "") {
      flush();
      return;
    }

    if (trimmed.startsWith("#")) {
      return;
    }

    if (trimmed === "-" || chosenLine.length > 0) {
      return;
    }

    chosenLine = trimmed;
  });

  flush();
  return result;
}

function parseMoves(text: string, namesByCanonicalKey: Record<string, string>, descriptionsByCanonicalKey: Record<string, string>): Record<string, MoveInfo> {
  const result: Record<string, MoveInfo> = {};
  const blockRegex = /\[\s*(MOVE_[A-Z0-9_]+)\s*\]\s*=\s*\{([\s\S]*?)\n\s*\},/g;

  const numberField = (body: string, name: string): number => {
    const match = body.match(new RegExp(`\\.${name}\\s*=\\s*(-?\\d+)`));
    return match ? Number.parseInt(match[1], 10) : 0;
  };

  const tokenField = (body: string, name: string): string => {
    const match = body.match(new RegExp(`\\.${name}\\s*=\\s*([A-Z0-9_]+)`));
    return match ? match[1] : "";
  };

  for (const match of text.matchAll(blockRegex)) {
    const key = match[1];
    const body = match[2];
    const canonical = canonicalToken(key);

    result[key] = {
      key,
      name: namesByCanonicalKey[canonical] ?? formatConstantToken(key),
      type: tokenField(body, "type"),
      split: tokenField(body, "split"),
      power: numberField(body, "power"),
      accuracy: numberField(body, "accuracy"),
      pp: numberField(body, "pp"),
      effect: tokenField(body, "effect"),
      description: descriptionsByCanonicalKey[canonical] ?? "",
    };
  }

  return result;
}

function parseAbilities(
  abilityConstants: string,
  namesByCanonicalKey: Record<string, string>,
  descriptionsByCanonicalKey: Record<string, string>,
): Record<string, AbilityInfo> {
  const result: Record<string, AbilityInfo> = {};
  const regex = /^#define\s+(ABILITY_[A-Z0-9_]+)\s+([0-9A-FxX]+)/gm;
  for (const match of abilityConstants.matchAll(regex)) {
    const key = match[1];
    if (key === "ABILITY_NONE") {
      continue;
    }

    const canonical = canonicalToken(key);
    result[key] = {
      key,
      name: namesByCanonicalKey[canonical] ?? formatConstantToken(key),
      description: descriptionsByCanonicalKey[canonical] ?? "",
    };
  }

  return result;
}

function parseItems(itemsConstants: string, itemTableDetails: string): Record<string, ItemInfo> {
  const result: Record<string, ItemInfo> = {};
  const regex = /^#define\s+(ITEM_[A-Z0-9_]+)\s+([0-9A-FxX]+)/gm;
  const flingInfo: Record<string, { power: number; effect: string }> = {};

  const flingRegex = /\[(ITEM_[A-Z0-9_]+)\]\s*=\s*\{(\d+)\s*,\s*([A-Z0-9_]+)\}/g;
  for (const match of itemTableDetails.matchAll(flingRegex)) {
    flingInfo[match[1]] = {
      power: Number.parseInt(match[2], 10),
      effect: match[3],
    };
  }

  for (const match of itemsConstants.matchAll(regex)) {
    const key = match[1];
    if (key === "ITEM_NONE") {
      continue;
    }

    const fling = flingInfo[key];
    const description = fling
      ? `Fling power ${fling.power}${fling.effect !== "0" ? `. Effect: ${formatConstantToken(fling.effect)}.` : "."}`
      : "";

    result[key] = {
      key,
      name: formatConstantToken(key),
      description,
    };
  }
  return result;
}

// ---- Evolution chain helpers ----

// Evo methods that represent alternate forms, not true evolutionary lines (used only for root-finding).
const FORM_EVO_METHODS = new Set(["EVO_MEGA", "EVO_GIGANTAMAX", "EVO_PRIMAL", "EVO_ULTRA_BURST"]);

function isFormSpecies(species: string): boolean {
  return /_(MEGA(_X|_Y)?|GIGA|PRIMAL|ULTRA)$/.test(species);
}

/** Build a tree rooted at `species`, DFS on all forward evolutions (including Mega/Giga as leaf branches). */
function buildTreeFrom(
  species: string,
  incomingMethod: string,
  incomingCondition: string,
  evolutions: Record<string, PokemonEvolution[]>,
  visited: Set<string>,
): EvoTreeNode {
  visited.add(species);
  const children: EvoTreeNode[] = [];
  for (const evo of evolutions[species] ?? []) {
    if (!visited.has(evo.target)) {
      children.push(buildTreeFrom(evo.target, evo.method, evo.condition, evolutions, new Set(visited)));
    }
  }
  return { species, method: incomingMethod, condition: incomingCondition, children };
}

/** Build a map from every species → the root EvoTreeNode of its full evolution tree. */
function buildEvoTrees(evolutions: Record<string, PokemonEvolution[]>): Record<string, EvoTreeNode> {
  // Build reverse map excluding form evolutions, to find true roots.
  const reverseMap = new Map<string, string>(); // target → source (non-form only)
  const formToBase = new Map<string, string>();  // mega/giga → base species

  for (const [source, targets] of Object.entries(evolutions)) {
    for (const evo of targets) {
      if (FORM_EVO_METHODS.has(evo.method)) {
        if (isFormSpecies(source) && !isFormSpecies(evo.target)) {
          formToBase.set(source, evo.target);
        } else if (!isFormSpecies(source) && isFormSpecies(evo.target)) {
          formToBase.set(evo.target, source);
        }
      } else {
        reverseMap.set(evo.target, source);
      }
    }
  }

  function findRoot(species: string): string {
    let current = species;
    const visited = new Set<string>();
    while (reverseMap.has(current) && !visited.has(current)) {
      visited.add(current);
      current = reverseMap.get(current)!;
    }
    return current;
  }

  const trees: Record<string, EvoTreeNode> = {};
  const allSpecies = new Set([
    ...Object.keys(evolutions),
    ...[...reverseMap.values()],
    ...[...reverseMap.keys()],
  ]);

  // Cache roots to avoid rebuilding the same tree multiple times.
  const rootTrees = new Map<string, EvoTreeNode>();

  for (const species of allSpecies) {
    const root = findRoot(species);
    if (!rootTrees.has(root)) {
      rootTrees.set(root, buildTreeFrom(root, "", "", evolutions, new Set()));
    }
    trees[species] = rootTrees.get(root)!;
  }

  // Form species share the same tree as their base form.
  for (const [form, base] of formToBase) {
    trees[form] = trees[base] ?? buildTreeFrom(form, "", "", evolutions, new Set());
  }

  return trees;
}

function buildPokemonDataset(
  entries: PokemonEntry[],
  baseStats: Record<string, Omit<PokemonDetails, "speciesKey" | "levelUpMoves" | "eggMoves" | "evolutions" | "locations" | "spriteUrl">>,
  learnsets: Record<string, PokemonMoveLearn[]>,
  eggMoves: Record<string, string[]>,
  evolutions: Record<string, PokemonEvolution[]>,
  locations: Record<string, PokemonLocation[]>,
  sprites: Record<string, string>,
): Record<string, PokemonDetails> {
  const result: Record<string, PokemonDetails> = {};
  const evoTrees = buildEvoTrees(evolutions);
  const reverseMap = new Map<string, string>();
  const formToBase = new Map<string, string>();

  for (const [source, targets] of Object.entries(evolutions)) {
    for (const evo of targets) {
      if (FORM_EVO_METHODS.has(evo.method)) {
        if (isFormSpecies(source) && !isFormSpecies(evo.target)) {
          formToBase.set(source, evo.target);
        } else if (!isFormSpecies(source) && isFormSpecies(evo.target)) {
          formToBase.set(evo.target, source);
        }
      } else {
        reverseMap.set(evo.target, source);
      }
    }
  }

  const resolveEggMoves = (speciesKey: string): string[] => {
    const direct = eggMoves[speciesKey];
    if (direct && direct.length > 0) {
      return direct;
    }

    const baseFromForm = formToBase.get(speciesKey);
    if (baseFromForm) {
      const formBaseEggMoves = eggMoves[baseFromForm];
      if (formBaseEggMoves && formBaseEggMoves.length > 0) {
        return formBaseEggMoves;
      }
    }

    let current = baseFromForm ?? speciesKey;
    const visited = new Set<string>();
    while (reverseMap.has(current) && !visited.has(current)) {
      visited.add(current);
      current = reverseMap.get(current)!;
      const inheritedEggMoves = eggMoves[current];
      if (inheritedEggMoves && inheritedEggMoves.length > 0) {
        return inheritedEggMoves;
      }
    }

    return [];
  };

  // Build a display-name → speciesKey map to match location JSON (keyed by name) to species keys.
  const nameToSpecies = new Map<string, string>();
  for (const entry of entries) {
    nameToSpecies.set(entry.displayName.toLowerCase(), entry.id);
    // Also try formatted token (handles special cases like "Farfetch'd")
    const formatted = formatConstantToken(entry.id.replace("SPECIES_", "")).toLowerCase();
    nameToSpecies.set(formatted, entry.id);
  }

  entries.forEach((entry) => {
    const speciesKey = entry.id;
    const statsAndTraits = baseStats[speciesKey];
    if (!statsAndTraits) return;

    const evoTree = evoTrees[speciesKey] ?? { species: speciesKey, method: "", condition: "", children: [] };

    // Match locations by display name
    const locs = locations[entry.displayName]
      ?? locations[formatConstantToken(speciesKey.replace("SPECIES_", ""))]
      ?? [];

    result[speciesKey] = {
      speciesKey,
      types: statsAndTraits.types,
      stats: statsAndTraits.stats,
      abilities: statsAndTraits.abilities,
      heldItems: statsAndTraits.heldItems,
      levelUpMoves: learnsets[speciesKey] ?? [],
      eggMoves: resolveEggMoves(speciesKey),
      evolutions: evoTree,
      locations: locs,
      spriteUrl: sprites[speciesKey] ?? "",
    };
  });

  return result;
}

async function fetchAllSources(): Promise<SourceBundle> {
  const [
    baseStats,
    learnsets,
    eggMoves,
    evolutions,
    frontSprites,
    locations,
    movesTable,
    moveNames,
    moveDescriptions,
    abilitiesTable,
    abilityNames,
    abilityDescriptions,
    itemsTable,
    itemTableDetails,
  ] = await Promise.all([
    fetchText(SOURCES.baseStats),
    fetchText(SOURCES.learnsets),
    fetchText(SOURCES.eggMoves),
    fetchText(SOURCES.evolutions),
    fetchText(SOURCES.frontSprites),
    fetchJson(SOURCES.locations),
    fetchText(SOURCES.movesTable),
    fetchText(SOURCES.moveNames),
    fetchText(SOURCES.moveDescriptions),
    fetchText(SOURCES.abilitiesTable),
    fetchText(SOURCES.abilityNames),
    fetchText(SOURCES.abilityDescriptions),
    fetchText(SOURCES.itemsTable),
    fetchText(SOURCES.itemTableDetails),
  ]);

  return {
    baseStats,
    learnsets,
    eggMoves,
    evolutions,
    frontSprites,
    locations,
    movesTable,
    moveNames,
    moveDescriptions,
    abilitiesTable,
    abilityNames,
    abilityDescriptions,
    itemsTable,
    itemTableDetails,
  };
}

export async function getUnboundDataset(entries: PokemonEntry[]): Promise<UnboundDataset> {
  const cached = await readJsonFromPersistentCache<UnboundDataset>(DATASET_CACHE_KEY);
  if (cached?.pokemon && cached?.moves && cached?.abilities && cached?.items) {
    return cached;
  }

  const sources = await fetchAllSources();
  const baseStats = parseBaseStats(sources.baseStats);
  const learnsets = parseLevelUpLearnsets(sources.learnsets);
  const eggMoves = parseEggMoves(sources.eggMoves);
  const evolutions = parseEvolutions(sources.evolutions);
  const sprites = parseSprites(sources.frontSprites);
  const locations = parseLocations(sources.locations);

  const moveNamesByCanonicalKey = parseMoveNames(sources.moveNames);
  const moveDescriptionsByCanonicalKey = parseDescriptions(sources.moveDescriptions, "MOVE");
  const moves = parseMoves(sources.movesTable, moveNamesByCanonicalKey, moveDescriptionsByCanonicalKey);

  const abilityNamesByCanonicalKey = parseAbilityNames(sources.abilityNames);
  const abilityDescriptionsByCanonicalKey = parseDescriptions(sources.abilityDescriptions, "ABILITY");
  const abilities = parseAbilities(
    sources.abilitiesTable,
    abilityNamesByCanonicalKey,
    abilityDescriptionsByCanonicalKey,
  );

  const items = parseItems(sources.itemsTable, sources.itemTableDetails);

  const dataset: UnboundDataset = {
    pokemon: buildPokemonDataset(entries, baseStats, learnsets, eggMoves, evolutions, locations, sprites),
    moves,
    abilities,
    items,
  };

  await writeJsonToPersistentCache(DATASET_CACHE_KEY, dataset);
  return dataset;
}

export function getDisplayToken(raw: string): string {
  return formatConstantToken(raw);
}

export async function prefetchPokemonSprites(dataset: UnboundDataset): Promise<void> {
  const allSpriteUrls = Object.values(dataset.pokemon)
    .map((details) => details.spriteUrl)
    .filter((value): value is string => Boolean(value));

  const chunkSize = 8;
  for (let index = 0; index < allSpriteUrls.length; index += chunkSize) {
    const chunk = allSpriteUrls.slice(index, index + chunkSize);
    await Promise.all(
      chunk.map(async (url) => {
        try {
          await fetchWithPersistentCache(url);
        } catch (error) {
          console.warn("Sprite prefetch failed:", url, error);
        }
      }),
    );
  }
}
