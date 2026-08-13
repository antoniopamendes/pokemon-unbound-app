import type { BuildMap, CaughtPokemonMap } from "./types";

const STORAGE_KEY = "unbound-tracker-caught-v1";
const BUILD_STORAGE_KEY = "unbound-tracker-builds-v1";
const CAUGHT_PROFILE_STORAGE_KEY = "unbound-tracker-caught-profile-v1";

export type CaughtMap = Record<string, boolean>;

export function loadCaughtMap(): CaughtMap {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    console.warn("Caught progress is corrupted and will be reset.", error);
    return {};
  }

  if (!parsed || typeof parsed !== "object") {
    console.warn("Caught progress format is invalid and will be reset.");
    return {};
  }

  return parsed as CaughtMap;
}

export function saveCaughtMap(value: CaughtMap): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function loadBuildMap(): BuildMap {
  const raw = localStorage.getItem(BUILD_STORAGE_KEY);
  if (!raw) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    console.warn("Build data is corrupted and will be reset.", error);
    return {};
  }

  if (!parsed || typeof parsed !== "object") {
    console.warn("Build data format is invalid and will be reset.");
    return {};
  }

  return parsed as BuildMap;
}

export function saveBuildMap(value: BuildMap): void {
  localStorage.setItem(BUILD_STORAGE_KEY, JSON.stringify(value));
}

export function loadCaughtPokemonMap(): CaughtPokemonMap {
  const raw = localStorage.getItem(CAUGHT_PROFILE_STORAGE_KEY);
  if (!raw) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    console.warn("Caught Pokémon profile data is corrupted and will be reset.", error);
    return {};
  }

  if (!parsed || typeof parsed !== "object") {
    console.warn("Caught Pokémon profile format is invalid and will be reset.");
    return {};
  }

  const asRecord = parsed as Record<string, unknown>;
  const migrated: CaughtPokemonMap = {};

  const pushProfile = (bucketSpecies: string, rawProfile: unknown, fallbackSpecies: string) => {
    if (!rawProfile || typeof rawProfile !== "object") {
      return;
    }
    const profile = rawProfile as Record<string, unknown>;
    const currentSpecies =
      typeof profile.currentSpecies === "string" && profile.currentSpecies.length > 0
        ? profile.currentSpecies
        : fallbackSpecies;
    const originalSpecies =
      typeof profile.originalSpecies === "string" && profile.originalSpecies.length > 0
        ? profile.originalSpecies
        : fallbackSpecies;
    const id =
      typeof profile.id === "string" && profile.id.length > 0
        ? profile.id
        : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const normalized = {
      ...profile,
      id,
      originalSpecies,
      currentSpecies,
      startingSpecies:
        typeof profile.startingSpecies === "string" && profile.startingSpecies.length > 0
          ? profile.startingSpecies
          : currentSpecies,
    } as CaughtPokemonMap[string][number];

    if (!migrated[bucketSpecies]) {
      migrated[bucketSpecies] = [];
    }
    migrated[bucketSpecies].push(normalized);
  };

  for (const [species, value] of Object.entries(asRecord)) {
    if (Array.isArray(value)) {
      value.forEach((profile) => {
        const currentSpecies =
          profile && typeof profile === "object" && typeof (profile as { currentSpecies?: unknown }).currentSpecies === "string"
            ? ((profile as { currentSpecies: string }).currentSpecies || species)
            : species;
        // Rebucket by currentSpecies so evolved entries no longer stay under the old species.
        pushProfile(currentSpecies, profile, species);
      });
      continue;
    }
    // Backward compatibility: old shape stored one profile per key.
    pushProfile(species, value, species);
  }

  return migrated;
}

export function saveCaughtPokemonMap(value: CaughtPokemonMap): void {
  localStorage.setItem(CAUGHT_PROFILE_STORAGE_KEY, JSON.stringify(value));
}
