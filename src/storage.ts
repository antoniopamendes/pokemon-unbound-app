import type { BoxesData, BuildMap, CaughtPokemonMap, CaughtSpeciesMap, PartyData, PokemonBox } from "./types";

export type DataSnapshot = {
  caughtPokemonMap: CaughtPokemonMap;
  buildMap: BuildMap;
  boxesData: BoxesData;
  caughtSpeciesMap: CaughtSpeciesMap;
  partyData: PartyData;
};

/** Emitted whenever persisted tracker data changes in this browser. */
export const LOCAL_DATA_CHANGED_EVENT = "unbound-tracker-local-data-changed";

const STORAGE_KEY = "unbound-tracker-caught-v1";
const BUILD_STORAGE_KEY = "unbound-tracker-builds-v1";
const CAUGHT_PROFILE_STORAGE_KEY = "unbound-tracker-caught-profile-v1";
const BOXES_STORAGE_KEY = "unbound-tracker-boxes-v1";
const PARTY_STORAGE_KEY = "unbound-tracker-party-v1";
export const PARTY_SLOT_COUNT = 6;

// Standard Pokemon PC Box dimensions: 6 columns x 5 rows.
export const BOX_COLUMNS = 6;
export const BOX_ROWS = 5;
export const BOX_SLOT_COUNT = BOX_COLUMNS * BOX_ROWS;
const DEFAULT_BOX_COUNT = 6;

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return value === undefined ? "null" : JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(",")}}`;
}

function notifyLocalDataChanged(): void {
  window.dispatchEvent(new Event(LOCAL_DATA_CHANGED_EVENT));
}

function writeStorageValue(key: string, value: unknown, notify = true): void {
  const serialized = JSON.stringify(value);
  if (localStorage.getItem(key) === serialized) {
    return;
  }
  localStorage.setItem(key, serialized);
  if (notify) {
    notifyLocalDataChanged();
  }
}

function createEmptyBox(index: number): PokemonBox {
  return { name: `Box ${index + 1}`, slots: new Array(BOX_SLOT_COUNT).fill(null) };
}

function createDefaultBoxes(): BoxesData {
  return Array.from({ length: DEFAULT_BOX_COUNT }, (_, i) => createEmptyBox(i));
}


export function loadCaughtSpeciesMap(): CaughtSpeciesMap {
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

  return parsed as CaughtSpeciesMap;
}

export function saveCaughtSpeciesMap(value: CaughtSpeciesMap): void {
  writeStorageValue(STORAGE_KEY, value);
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
  writeStorageValue(BUILD_STORAGE_KEY, value);
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
  writeStorageValue(CAUGHT_PROFILE_STORAGE_KEY, value);
}

export function loadBoxesData(): BoxesData {
  const raw = localStorage.getItem(BOXES_STORAGE_KEY);
  if (!raw) {
    return createDefaultBoxes();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    console.warn("Box data is corrupted and will be reset.", error);
    return createDefaultBoxes();
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    console.warn("Box data format is invalid and will be reset.");
    return createDefaultBoxes();
  }

  return parsed.map((box, i) => {
    const rawBox = box as Partial<PokemonBox> | null;
    const slots = Array.isArray(rawBox?.slots) ? rawBox!.slots.slice(0, BOX_SLOT_COUNT) : [];
    while (slots.length < BOX_SLOT_COUNT) {
      slots.push(null);
    }
    return {
      name: typeof rawBox?.name === "string" && rawBox.name.length > 0 ? rawBox.name : `Box ${i + 1}`,
      slots: slots.map((slot) => (typeof slot === "string" && slot.length > 0 ? slot : null)),
    };
  });
}

export function saveBoxesData(value: BoxesData): void {
  writeStorageValue(BOXES_STORAGE_KEY, value);
}

export function createNewBox(index: number): PokemonBox {
  return createEmptyBox(index);
}

export function loadPartyData(): PartyData {
  const raw = localStorage.getItem(PARTY_STORAGE_KEY);
  if (!raw) {
    return new Array(PARTY_SLOT_COUNT).fill(null);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    console.warn("Party data is corrupted and will be reset.", error);
    return new Array(PARTY_SLOT_COUNT).fill(null);
  }

  if (!Array.isArray(parsed)) {
    console.warn("Party data format is invalid and will be reset.");
    return new Array(PARTY_SLOT_COUNT).fill(null);
  }

  const slots = parsed.slice(0, PARTY_SLOT_COUNT).map((slot) => (typeof slot === "string" && slot.length > 0 ? slot : null));
  while (slots.length < PARTY_SLOT_COUNT) {
    slots.push(null);
  }
  return slots;
}

export function savePartyData(value: PartyData): void {
  writeStorageValue(PARTY_STORAGE_KEY, value);
}

export function loadDataSnapshot(): DataSnapshot {
  return {
    caughtPokemonMap: loadCaughtPokemonMap(),
    buildMap: loadBuildMap(),
    boxesData: loadBoxesData(),
    caughtSpeciesMap: loadCaughtSpeciesMap(),
    partyData: loadPartyData(),
  };
}

/** Returns a key-order-independent fingerprint suitable for sync comparisons. */
export function fingerprintDataSnapshot(snapshot: DataSnapshot = loadDataSnapshot()): string {
  return stableSerialize(snapshot);
}

/** Replaces all persisted tracker data and emits one update after the replacement. */
export function replaceDataSnapshot(snapshot: DataSnapshot): void {
  writeStorageValue(CAUGHT_PROFILE_STORAGE_KEY, snapshot.caughtPokemonMap, false);
  writeStorageValue(BUILD_STORAGE_KEY, snapshot.buildMap, false);
  writeStorageValue(BOXES_STORAGE_KEY, snapshot.boxesData, false);
  writeStorageValue(STORAGE_KEY, snapshot.caughtSpeciesMap, false);
  writeStorageValue(PARTY_STORAGE_KEY, snapshot.partyData, false);
  notifyLocalDataChanged();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Normalizes a snapshot received from Supabase while keeping safe local defaults. */
export function normalizeDataSnapshot(value: unknown): DataSnapshot {
  const raw = isRecord(value) ? value : {};
  const rawBoxes = raw.boxesData;
  const boxesData: BoxesData = !Array.isArray(rawBoxes) || rawBoxes.length === 0
    ? createDefaultBoxes()
    : rawBoxes.map((box, i) => {
      const rawBox = box as Partial<PokemonBox> | null;
      const slots = Array.isArray(rawBox?.slots) ? rawBox.slots.slice(0, BOX_SLOT_COUNT) : [];
      while (slots.length < BOX_SLOT_COUNT) {
        slots.push(null);
      }
      return {
        name: typeof rawBox?.name === "string" && rawBox.name.length > 0 ? rawBox.name : `Box ${i + 1}`,
        slots: slots.map((slot) => (typeof slot === "string" && slot.length > 0 ? slot : null)),
      };
    });
  const rawParty = Array.isArray(raw.partyData) ? raw.partyData.slice(0, PARTY_SLOT_COUNT) : [];
  const partyData: PartyData = rawParty.map((slot) => (typeof slot === "string" && slot.length > 0 ? slot : null));
  while (partyData.length < PARTY_SLOT_COUNT) {
    partyData.push(null);
  }
  return {
    caughtPokemonMap: isRecord(raw.caughtPokemonMap) ? raw.caughtPokemonMap as CaughtPokemonMap : {},
    buildMap: isRecord(raw.buildMap) ? raw.buildMap as BuildMap : {},
    boxesData,
    caughtSpeciesMap: isRecord(raw.caughtSpeciesMap) ? raw.caughtSpeciesMap as CaughtSpeciesMap : {},
    partyData,
  };
}
