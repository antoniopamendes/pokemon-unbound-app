import { readJsonFromPersistentCache, writeJsonToPersistentCache } from "./httpCache";

const BASE = "https://pokeapi.co/api/v2";

function toApiName(constantKey: string, prefix: "MOVE" | "ABILITY"): string {
  return constantKey
    .replace(new RegExp(`^${prefix}_`), "")
    .toLowerCase()
    .replace(/_/g, "-");
}

function toApiSlugFromDisplayName(displayName: string): string {
  return displayName
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function moveApiCandidates(moveKey: string, moveName?: string): string[] {
  const candidates = new Set<string>();
  if (moveName) candidates.add(toApiSlugFromDisplayName(moveName));
  candidates.add(toApiName(moveKey, "MOVE"));
  return [...candidates].filter(Boolean);
}

function abilityApiCandidates(abilityKey: string, abilityName?: string): string[] {
  const candidates = new Set<string>();
  if (abilityName) candidates.add(toApiSlugFromDisplayName(abilityName));
  candidates.add(toApiName(abilityKey, "ABILITY"));
  return [...candidates].filter(Boolean);
}

function speciesKeyToApiCandidates(speciesKey: string): string[] {
  const base = speciesKey
    .replace(/^SPECIES_/, "")
    .toLowerCase()
    .replace(/_/g, "-");

  const candidates = new Set<string>([base]);
  if (base.endsWith("-giga")) {
    candidates.add(base.replace(/-giga$/, "-gmax"));
  }
  return [...candidates];
}

export async function fetchMoveDescription(moveKey: string, moveName?: string): Promise<string> {
  const cacheKey = `https://unbound-tracker.local/pokeapi/move-desc-v2/${moveKey}`;
  const cached = await readJsonFromPersistentCache<string>(cacheKey);
  if (cached) return cached;

  for (const name of moveApiCandidates(moveKey, moveName)) {
    try {
      const res = await fetch(`${BASE}/move/${name}`);
      if (!res.ok) continue;
      const data = (await res.json()) as {
        flavor_text_entries: { flavor_text: string; language: { name: string } }[];
      };
      const en = data.flavor_text_entries.filter((e) => e.language.name === "en");
      const desc = en.length > 0 ? en[en.length - 1].flavor_text.replace(/\n/g, " ").trim() : "";
      if (desc) {
        await writeJsonToPersistentCache(cacheKey, desc);
        return desc;
      }
    } catch {
      // Try next candidate.
    }
  }

  return "";
}

export async function fetchAbilityDescription(abilityKey: string, abilityName?: string): Promise<string> {
  const cacheKey = `https://unbound-tracker.local/pokeapi/ability-desc-v2/${abilityKey}`;
  const cached = await readJsonFromPersistentCache<string>(cacheKey);
  if (cached) return cached;

  for (const name of abilityApiCandidates(abilityKey, abilityName)) {
    try {
      const res = await fetch(`${BASE}/ability/${name}`);
      if (!res.ok) continue;
      const data = (await res.json()) as {
        effect_entries: { short_effect: string; language: { name: string } }[];
      };
      const en = data.effect_entries.filter((e) => e.language.name === "en");
      const desc = en.length > 0 ? en[0].short_effect.replace(/\n/g, " ").trim() : "";
      if (desc) {
        await writeJsonToPersistentCache(cacheKey, desc);
        return desc;
      }
    } catch {
      // Try next candidate.
    }
  }

  return "";
}

export async function fetchPokemonSpriteUrl(speciesKey: string): Promise<string> {
  const candidates = speciesKeyToApiCandidates(speciesKey);
  const cacheKey = `https://unbound-tracker.local/pokeapi/sprite-url/${speciesKey}`;
  const cached = await readJsonFromPersistentCache<string>(cacheKey);
  // Empty values may have been written by older versions after a transient
  // request failure. Treat them as misses so the URL can recover naturally.
  if (cached) return cached;

  for (const name of candidates) {
    try {
      const res = await fetch(`${BASE}/pokemon/${name}`);
      if (!res.ok) continue;
      const data = (await res.json()) as {
        sprites?: {
          front_default?: string | null;
          other?: { "official-artwork"?: { front_default?: string | null } };
        };
      };
      const spriteUrl =
        data.sprites?.other?.["official-artwork"]?.front_default
        ?? data.sprites?.front_default
        ?? "";
      if (spriteUrl) {
        await writeJsonToPersistentCache(cacheKey, spriteUrl);
        return spriteUrl;
      }
    } catch {
      // Try next candidate.
    }
  }

  return "";
}

export type PokemonMoveBuckets = {
  tmhm: string[];
  tutor: string[];
  tmhmNumbers: Record<string, string>;
};

const PREFERRED_MACHINE_VERSION_GROUPS = ["firered-leafgreen", "emerald", "ruby-sapphire"];

async function fetchMachineNumberForMove(moveSlug: string): Promise<string> {
  const cacheKey = `https://unbound-tracker.local/pokeapi/tmhm-number-v1/${moveSlug}`;
  const cached = await readJsonFromPersistentCache<string>(cacheKey);
  if (cached !== null) return cached;

  try {
    const res = await fetch(`${BASE}/move/${moveSlug}`);
    if (res.ok) {
      const data = (await res.json()) as {
        machines: Array<{ machine: { url: string }; version_group: { name: string } }>;
      };
      const machineEntry =
        PREFERRED_MACHINE_VERSION_GROUPS
          .map((group) => data.machines.find((m) => m.version_group.name === group))
          .find((entry): entry is NonNullable<typeof entry> => Boolean(entry))
        ?? data.machines[0];

      if (machineEntry) {
        const machineRes = await fetch(machineEntry.machine.url);
        if (machineRes.ok) {
          const machineData = (await machineRes.json()) as { item: { name: string } };
          const label = machineData.item.name.toUpperCase();
          await writeJsonToPersistentCache(cacheKey, label);
          return label;
        }
      }
    }
  } catch {
    // Fall through to empty result below.
  }

  await writeJsonToPersistentCache(cacheKey, "");
  return "";
}

export async function fetchPokemonMoveBuckets(speciesKey: string): Promise<PokemonMoveBuckets> {
  const candidates = speciesKeyToApiCandidates(speciesKey);
  const cacheKey = `https://unbound-tracker.local/pokeapi/move-buckets-v2/${speciesKey}`;
  const cached = await readJsonFromPersistentCache<PokemonMoveBuckets>(cacheKey);
  if (
    cached
    && typeof cached === "object"
    && Array.isArray(cached.tmhm)
    && Array.isArray(cached.tutor)
    && typeof cached.tmhmNumbers === "object"
  ) {
    return cached;
  }

  for (const name of candidates) {
    try {
      const res = await fetch(`${BASE}/pokemon/${name}`);
      if (!res.ok) continue;
      const data = (await res.json()) as {
        moves: Array<{
          move: { name: string };
          version_group_details: Array<{ move_learn_method: { name: string } }>;
        }>;
      };

      const tmhm = new Set<string>();
      const tutor = new Set<string>();
      for (const entry of data.moves) {
        const methods = entry.version_group_details.map((d) => d.move_learn_method.name);
        if (methods.includes("machine")) tmhm.add(entry.move.name);
        if (methods.includes("tutor")) tutor.add(entry.move.name);
      }

      const tmhmList = [...tmhm].sort();
      const tmhmNumbers: Record<string, string> = {};
      await Promise.all(
        tmhmList.map(async (slug) => {
          const label = await fetchMachineNumberForMove(slug);
          if (label) tmhmNumbers[slug] = label;
        }),
      );

      const buckets: PokemonMoveBuckets = {
        tmhm: tmhmList,
        tutor: [...tutor].sort(),
        tmhmNumbers,
      };
      await writeJsonToPersistentCache(cacheKey, buckets);
      return buckets;
    } catch {
      // Try next candidate.
    }
  }

  const emptyBuckets: PokemonMoveBuckets = { tmhm: [], tutor: [], tmhmNumbers: {} };
  await writeJsonToPersistentCache(cacheKey, emptyBuckets);
  return emptyBuckets;
}
