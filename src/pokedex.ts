import type { PokemonEntry } from "./types";
import { fetchWithPersistentCache } from "./httpCache";

const UNBOUND_SPECIES_URL =
  "https://raw.githubusercontent.com/Skeli789/Complete-Fire-Red-Upgrade/master/include/constants/species.h";
const POKEDEX_CACHE_KEY = "unbound-pokedex-entries-v2";
const POKEDEX_CACHE_VERSION = 2;

const CATCHABLE_BLACKLIST = new Set(["SPECIES_NONE", "SPECIES_EGG"]);

function toDisplayName(rawKey: string): string {
  const normalized = rawKey.replace(/^SPECIES_/, "");
  if (normalized === "NIDORAN_F") return "Nidoran ♀";
  if (normalized === "NIDORAN_M") return "Nidoran ♂";

  const generic = normalized
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  return generic.replace("Ho Oh", "Ho-Oh");
}

function parseSpeciesHeader(contents: string): PokemonEntry[] {
  const regex = /^\s*#define\s+(SPECIES_[A-Z0-9_]+)\s+([0-9A-FxX]+)\s*$/gm;
  const matches = [...contents.matchAll(regex)];

  return matches
    .map((match) => {
      const rawKey = match[1];
      const rawNumber = match[2];
      const speciesNumber = Number.parseInt(rawNumber, 0);
      return { rawKey, speciesNumber };
    })
    .filter((entry) => Number.isFinite(entry.speciesNumber))
    .filter((entry) => entry.speciesNumber > 0)
    .filter((entry) => !CATCHABLE_BLACKLIST.has(entry.rawKey))
    .sort((left, right) => left.speciesNumber - right.speciesNumber)
    .map((entry, index) => ({
      id: entry.rawKey,
      rawKey: entry.rawKey,
      speciesNumber: entry.speciesNumber,
      displayName: toDisplayName(entry.rawKey),
      dexOrder: index + 1,
    }));
}

function loadPokedexCache(): PokemonEntry[] | null {
  const raw = localStorage.getItem(POKEDEX_CACHE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as {
      version?: number;
      entries?: PokemonEntry[];
    };

    if (parsed.version !== POKEDEX_CACHE_VERSION) {
      return null;
    }

    if (!parsed.entries || parsed.entries.length === 0) {
      return null;
    }

    return parsed.entries;
  } catch (error) {
    console.warn("Pokedex cache is invalid and will be rebuilt.", error);
    return null;
  }
}

function savePokedexCache(entries: PokemonEntry[]): void {
  localStorage.setItem(
    POKEDEX_CACHE_KEY,
    JSON.stringify({
      version: POKEDEX_CACHE_VERSION,
      entries,
    }),
  );
}

export async function fetchUnboundPokedex(): Promise<PokemonEntry[]> {
  const cachedEntries = loadPokedexCache();
  if (cachedEntries) {
    return cachedEntries;
  }

  const response = await fetchWithPersistentCache(UNBOUND_SPECIES_URL);
  if (!response.ok) {
    throw new Error(`Unable to load Pokedex data (${response.status}).`);
  }

  const contents = await response.text();
  const entries = parseSpeciesHeader(contents);

  if (entries.length === 0) {
    throw new Error("Pokedex data loaded but returned no entries.");
  }

  savePokedexCache(entries);
  return entries;
}
