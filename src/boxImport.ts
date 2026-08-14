import { NATURE_BY_NAME, emptySpread } from "./pokemonBuild";
import { getDisplayToken } from "./unboundData";
import type { CaughtPokemonProfile, PokemonEntry, StatSpread, UnboundDataset } from "./types";

export type BoxImportRow = {
  index: number;
  nickname: string;
  speciesLabel: string;
  speciesId: string | null;
  gender?: "M" | "F";
  shiny: boolean;
  happiness: number;
  level: number;
  nature: string;
  abilityLabel: string;
  abilityId: string;
  itemLabel: string;
  itemId: string;
  evs: StatSpread;
  ivs: StatSpread;
  moveLabels: string[];
  moveKeys: string[];
  errors: string[];
  warnings: string[];
  alreadyCaught: boolean;
  include: boolean;
  markCaught: boolean;
};

export type BoxImportResult = { rows: BoxImportRow[]; errors: string[] };

const STAT_ALIASES: Record<string, keyof StatSpread> = {
  hp: "hp", atk: "attack", attack: "attack", def: "defense", defense: "defense",
  spa: "spAttack", spatk: "spAttack", spattack: "spAttack", spd: "spDefense", spdef: "spDefense",
  spdefense: "spDefense", spe: "speed", speed: "speed",
};

function normalize(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

function lookupByName<T extends { key: string }>(items: Record<string, T>, label: string, display: (item: T) => string): string {
  const target = normalize(label);
  const exact = Object.values(items).find((item) => normalize(display(item)) === target || normalize(getDisplayToken(item.key)) === target);
  return exact?.key ?? "";
}

function parseSpread(line: string | undefined, kind: "EVs" | "IVs"): { spread: StatSpread; errors: string[] } {
  const spread = emptySpread(kind === "IVs" ? 31 : 0);
  if (!line) return { spread, errors: [] };
  const errors: string[] = [];
  const body = line.replace(new RegExp(`^${kind}:?\\s*`, "i"), "");
  for (const part of body.split("/")) {
    const match = part.trim().match(/^(\d+)\s+(.+)$/);
    if (!match) continue;
    const key = STAT_ALIASES[normalize(match[2])];
    const value = Number.parseInt(match[1], 10);
    if (!key || !Number.isFinite(value)) continue;
    const max = kind === "IVs" ? 31 : 252;
    if (value < 0 || value > max) errors.push(`${kind} ${match[2]} must be between 0 and ${max}.`);
    spread[key] = Math.max(0, Math.min(max, value));
  }
  return { spread, errors };
}

function buildSpeciesLookup(entries: PokemonEntry[], dataset: UnboundDataset): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const entry of entries) {
    lookup.set(normalize(entry.displayName), entry.id);
    lookup.set(normalize(entry.rawKey), entry.id);
    lookup.set(normalize(entry.id.replace(/^SPECIES_/, "")), entry.id);
  }
  for (const key of Object.keys(dataset.pokemon)) {
    lookup.set(normalize(key), key);
    lookup.set(normalize(key.replace(/^SPECIES_/, "")), key);
  }
  return lookup;
}

export function rebindBoxImportRow(
  row: BoxImportRow,
  speciesId: string | null,
  dataset: UnboundDataset,
  caughtSpeciesMap: Record<string, boolean>,
  caughtProfiles: CaughtPokemonProfile[],
): BoxImportRow {
  const errors = row.errors.filter((message) => !message.startsWith("Species “"));
  const warnings = row.warnings.filter((message) =>
    message !== "The imported ability is not listed for this form."
    && message !== "One or more moves may be from a TM, tutor, or event source.",
  );
  const abilityMismatch = Boolean(row.abilityId && speciesId && !dataset.pokemon[speciesId]?.abilities.includes(row.abilityId));
  const knownLevelMoves = new Set([
    ...(dataset.pokemon[speciesId ?? ""]?.levelUpMoves ?? []).map((move) => move.move),
    ...(dataset.pokemon[speciesId ?? ""]?.eggMoves ?? []),
  ]);
  const hasNonLevelMove = Boolean(speciesId && row.moveKeys.some((key) => !knownLevelMoves.has(key)));
  if (abilityMismatch) warnings.push("The imported ability is not listed for this form.");
  if (hasNonLevelMove) warnings.push("One or more moves may be from a TM, tutor, or event source.");
  if (!speciesId) errors.push(`Species “${row.speciesLabel}” was not found.`);
  const alreadyCaught = Boolean(speciesId && (caughtSpeciesMap[speciesId] || caughtProfiles.some((profile) => profile.currentSpecies === speciesId)));
  const canInclude = errors.length === 0;
  return {
    ...row,
    speciesId,
    errors,
    warnings,
    alreadyCaught,
    include: canInclude && alreadyCaught,
    markCaught: false,
  };
}

function parseHeader(line: string): { nickname: string; speciesLabel: string; gender?: "M" | "F"; itemLabel: string } {
  const match = line.trim().match(/^(.*?)\s+\(([^()]+)\)(?:\s+\(([MF])\))?(?:\s+@\s*(.+))?$/i);
  if (!match) return { nickname: line.trim(), speciesLabel: line.trim(), itemLabel: "" };
  return { nickname: match[1].trim(), speciesLabel: match[2].trim(), gender: match[3]?.toUpperCase() as "M" | "F" | undefined, itemLabel: match[4]?.trim() ?? "" };
}

export function parseBoxImport(text: string, entries: PokemonEntry[], dataset: UnboundDataset, caughtSpeciesMap: Record<string, boolean>, caughtProfiles: CaughtPokemonProfile[]): BoxImportResult {
  const speciesLookup = buildSpeciesLookup(entries, dataset);
  const caughtProfileSpecies = new Set(caughtProfiles.map((profile) => profile.currentSpecies));
  const blocks = text.replace(/\r/g, "").split(/\n\s*\n+/).map((block) => block.trim()).filter(Boolean);
  const rows: BoxImportRow[] = [];
  const errors: string[] = [];

  blocks.forEach((block, blockIndex) => {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) return;
    const header = parseHeader(lines[0]);
    const rowErrors: string[] = [];
    const rowWarnings: string[] = [];
    const speciesId = speciesLookup.get(normalize(header.speciesLabel)) ?? null;
    if (!speciesId) rowErrors.push(`Species “${header.speciesLabel}” was not found.`);
    const valueLine = (prefix: string) => lines.find((line) => line.toLowerCase().startsWith(prefix.toLowerCase()));
    const levelMatch = valueLine("Level")?.match(/Level:\s*(\d+)/i);
    const level = levelMatch ? Number.parseInt(levelMatch[1], 10) : 1;
    if (!levelMatch || level < 1 || level > 100) rowErrors.push("Level must be between 1 and 100.");
    const natureMatch = lines.find((line) => /Nature$/i.test(line))?.match(/^(.+?)\s+Nature$/i);
    const nature = natureMatch?.[1] ?? "Hardy";
    if (!NATURE_BY_NAME.has(nature)) rowErrors.push(`Nature “${nature}” was not recognized.`);
    const abilityLabel = valueLine("Ability:")?.replace(/^Ability:\s*/i, "").trim() ?? "";
    const abilityId = abilityLabel ? lookupByName(dataset.abilities, abilityLabel, (item) => item.name) : "";
    if (abilityLabel && !abilityId) rowErrors.push(`Ability “${abilityLabel}” was not found.`);
    const itemId = header.itemLabel ? lookupByName(dataset.items, header.itemLabel, (item) => item.name) : "";
    if (header.itemLabel && !itemId) rowErrors.push(`Item “${header.itemLabel}” was not found.`);
    const evResult = parseSpread(valueLine("EVs:"), "EVs");
    const ivResult = parseSpread(valueLine("IVs:"), "IVs");
    rowErrors.push(...evResult.errors, ...ivResult.errors);
    const moveLabels = lines.filter((line) => line.startsWith("-")).map((line) => line.replace(/^[-]\s*/, "").trim());
    const moveKeys = moveLabels.map((label) => lookupByName(dataset.moves, label, (item) => item.name));
    moveLabels.forEach((label, index) => { if (!moveKeys[index]) rowErrors.push(`Move “${label}” was not found.`); });
    if (moveKeys.length === 0) rowErrors.push("At least one move is required.");
    const shiny = /^Shiny:\s*Yes/i.test(valueLine("Shiny:") ?? "");
    const happinessMatch = valueLine("Happiness:")?.match(/Happiness:\s*(-?\d+)/i);
    const happiness = happinessMatch ? Number.parseInt(happinessMatch[1], 10) : 0;
    if (happiness < 0 || happiness > 255) rowErrors.push("Happiness must be between 0 and 255.");
    if (abilityId && speciesId && !dataset.pokemon[speciesId]?.abilities.includes(abilityId)) rowWarnings.push("The imported ability is not listed for this form.");
    if (moveKeys.some((key) => speciesId && !new Set([...(dataset.pokemon[speciesId]?.levelUpMoves ?? []).map((move) => move.move), ...(dataset.pokemon[speciesId]?.eggMoves ?? [])]).has(key))) rowWarnings.push("One or more moves may be from a TM, tutor, or event source.");
    const alreadyCaught = Boolean(speciesId && (caughtSpeciesMap[speciesId] || caughtProfileSpecies.has(speciesId)));
    rows.push({ index: blockIndex, nickname: header.nickname, speciesLabel: header.speciesLabel, speciesId, gender: header.gender, shiny, happiness, level, nature, abilityLabel, abilityId, itemLabel: header.itemLabel, itemId, evs: evResult.spread, ivs: ivResult.spread, moveLabels, moveKeys, errors: rowErrors, warnings: rowWarnings, alreadyCaught, include: rowErrors.length === 0 && alreadyCaught, markCaught: false });
  });
  if (rows.length === 0) errors.push("Paste one or more Pokémon blocks to review.");
  return { rows, errors };
}

export function profileFromImport(row: BoxImportRow): CaughtPokemonProfile {
  if (!row.speciesId) throw new Error("Cannot create a profile without a species.");
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    originalSpecies: row.speciesId,
    currentSpecies: row.speciesId,
    nickname: row.nickname || undefined,
    gender: row.gender,
    shiny: row.shiny,
    happiness: row.happiness,
    level: row.level,
    nature: row.nature,
    ability: row.abilityId,
    item: row.itemId,
    evs: { ...row.evs },
    ivs: { ...row.ivs },
    moveset: [...row.moveKeys],
    updatedAt: new Date().toISOString(),
  };
}
