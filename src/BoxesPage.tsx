import { useEffect, useMemo, useState } from "react";
import type { DragEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SpriteImage } from "./App";
import { CaughtProfileModal } from "./CaughtProfileModal";
import { fetchUnboundPokedex } from "./pokedex";
import { NATURE_BY_NAME } from "./pokemonBuild";
import { calculateCaughtPokemonStats, getNatureModifiers } from "./statCalculator";
import {
  BOX_COLUMNS,
  BOX_SLOT_COUNT,
  PARTY_SLOT_COUNT,
  createNewBox,
  loadBoxesData,
  loadCaughtPokemonMap,
  loadCaughtSpeciesMap,
  loadPartyData,
  saveBoxesData,
  saveCaughtPokemonMap,
  saveCaughtSpeciesMap,
  savePartyData,
} from "./storage";
import { getDisplayToken, getUnboundDataset } from "./unboundData";
import { useCloudSync } from "./useCloudSync";
import { getTypeColor, getTypeTextColor } from "./typeColors";
import { ALL_TYPES, getTypeMatchups } from "./typeEffectiveness";
import type {
  BoxesData,
  CaughtPokemonMap,
  CaughtPokemonProfile,
  CaughtSpeciesMap,
  PartyData,
  PokemonEntry,
  UnboundDataset,
} from "./types";

/** Finds a caught profile by id across every species bucket. */
function findProfileById(
  caughtPokemonMap: CaughtPokemonMap,
  profileId: string,
): CaughtPokemonProfile | null {
  for (const profiles of Object.values(caughtPokemonMap)) {
    const match = profiles.find((profile) => profile.id === profileId);
    if (match) {
      return match;
    }
  }
  return null;
}

/** Where a slot lives: a specific box+index, or the party (carried Pokémon). */
type SlotLocation = { kind: "box"; boxIndex: number; slotIndex: number } | { kind: "party"; slotIndex: number };

export default function BoxesPage() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<PokemonEntry[]>([]);
  const [dataset, setDataset] = useState<UnboundDataset | null>(null);
  const [caughtPokemonMap, setCaughtPokemonMap] = useState<CaughtPokemonMap>(() => loadCaughtPokemonMap());
  const [caughtSpeciesMap, setCaughtSpeciesMap] = useState<CaughtSpeciesMap>(() => loadCaughtSpeciesMap());
  const [boxesData, setBoxesData] = useState<BoxesData>(() => loadBoxesData());
  const [partyData, setPartyData] = useState<PartyData>(() => loadPartyData());
  const [renamingBoxIndex, setRenamingBoxIndex] = useState<number | null>(null);
  const [boxNameDraft, setBoxNameDraft] = useState("");
  const [pickerLocation, setPickerLocation] = useState<SlotLocation | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [newProfileSpecies, setNewProfileSpecies] = useState<string | null>(null);
  const [actionLocation, setActionLocation] = useState<SlotLocation | null>(null);
  const [editingProfile, setEditingProfile] = useState<CaughtPokemonProfile | null>(null);
  const [dragSource, setDragSource] = useState<SlotLocation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cloudSync = useCloudSync({
    caughtPokemonMap,
    setCaughtPokemonMap,
    boxesData,
    setBoxesData,
    caughtSpeciesMap,
    setCaughtSpeciesMap,
    partyData,
    setPartyData,
  });

  useEffect(() => {
    const run = async () => {
      try {
        const pokedexEntries = await fetchUnboundPokedex();
        setEntries(pokedexEntries);
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "Unable to load Pokemon data.");
        setIsLoading(false);
      }
    };
    void run();
  }, []);

  useEffect(() => {
    if (entries.length === 0) {
      return;
    }
    const run = async () => {
      try {
        const loadedDataset = await getUnboundDataset(entries);
        setDataset(loadedDataset);
      } catch (datasetError) {
        setError(datasetError instanceof Error ? datasetError.message : "Unable to build the Unbound dataset.");
      } finally {
        setIsLoading(false);
      }
    };
    void run();
  }, [entries]);

  useEffect(() => {
    saveBoxesData(boxesData);
  }, [boxesData]);

  useEffect(() => {
    savePartyData(partyData);
  }, [partyData]);

  useEffect(() => {
    saveCaughtPokemonMap(caughtPokemonMap);
  }, [caughtPokemonMap]);

  useEffect(() => {
    saveCaughtSpeciesMap(caughtSpeciesMap);
  }, [caughtSpeciesMap]);

  const displayNameFor = (speciesId: string) =>
    entries.find((entry) => entry.id === speciesId)?.displayName
    ?? getDisplayToken(speciesId.replace("SPECIES_", ""));

  // Every profile id currently placed in any box or in the party, across the whole collection.
  const assignedProfileIds = useMemo(() => {
    const set = new Set<string>();
    for (const box of boxesData) {
      for (const slot of box.slots) {
        if (slot) set.add(slot);
      }
    }
    for (const slot of partyData) {
      if (slot) set.add(slot);
    }
    return set;
  }, [boxesData, partyData]);

  const allProfiles = useMemo(
    () => Object.values(caughtPokemonMap).flat(),
    [caughtPokemonMap],
  );

  // Owned Pokémon that aren't currently placed in any box or party slot (e.g. "removed" from a
  // slot without being released) — surfaced so they can be re-assigned or fully released.
  const unassignedProfiles = useMemo(
    () => allProfiles.filter((profile) => !assignedProfileIds.has(profile.id)),
    [allProfiles, assignedProfileIds],
  );

  const availableProfiles = useMemo(() => {
    const query = pickerSearch.trim().toLowerCase();
    if (!query) {
      return unassignedProfiles;
    }
    return unassignedProfiles.filter((profile) => displayNameFor(profile.currentSpecies).toLowerCase().includes(query));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unassignedProfiles, pickerSearch, entries]);

  // Species marked as caught (pokeball toggle) that can be newly added as an owned Pokémon.
  const caughtSpeciesOptions = useMemo(() => {
    const query = pickerSearch.trim().toLowerCase();
    return entries
      .filter((entry) => caughtSpeciesMap[entry.id])
      .filter((entry) => !query || entry.displayName.toLowerCase().includes(query))
      .sort((a, b) => a.dexOrder - b.dexOrder);
  }, [entries, caughtSpeciesMap, pickerSearch]);

  const totalCaught = allProfiles.length;
  const totalBoxed = assignedProfileIds.size;

  // Party members with their profile resolved, in slot order (skips empty slots).
  const partyMembers = useMemo(() => {
    return partyData
      .map((profileId) => (profileId ? findProfileById(caughtPokemonMap, profileId) : null))
      .filter((profile): profile is CaughtPokemonProfile => profile !== null);
  }, [partyData, caughtPokemonMap]);

  // Each party member's calculated stats (using its species base stats, level, nature, IVs/EVs).
  const partyMemberStats = useMemo(() => {
    if (!dataset) return new Map<string, ReturnType<typeof calculateCaughtPokemonStats>>();
    const map = new Map<string, ReturnType<typeof calculateCaughtPokemonStats>>();
    for (const profile of partyMembers) {
      const details = dataset.pokemon[profile.currentSpecies];
      if (!details) continue;
      const nature = NATURE_BY_NAME.get(profile.nature);
      const modifiers = getNatureModifiers(nature?.up ?? null, nature?.down ?? null);
      map.set(profile.id, calculateCaughtPokemonStats(details.stats, profile.level, profile.ivs, profile.evs, modifiers));
    }
    return map;
  }, [dataset, partyMembers]);

  // Sum of every party member's calculated stats — a quick "team power" overview.
  const teamStatTotals = useMemo(() => {
    const totals = { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0, total: 0 };
    for (const stats of partyMemberStats.values()) {
      totals.hp += stats.hp;
      totals.attack += stats.attack;
      totals.defense += stats.defense;
      totals.spAttack += stats.spAttack;
      totals.spDefense += stats.spDefense;
      totals.speed += stats.speed;
      totals.total += stats.total;
    }
    return totals;
  }, [partyMemberStats]);

  // For each attacking type, how many party members are weak/resistant/immune to it —
  // helps spot team-wide type coverage gaps.
  const teamTypeCoverage = useMemo(() => {
    const coverage: Record<string, { weak: number; resist: number; immune: number }> = {};
    for (const type of ALL_TYPES) {
      coverage[type] = { weak: 0, resist: 0, immune: 0 };
    }
    if (!dataset) return coverage;
    for (const profile of partyMembers) {
      const details = dataset.pokemon[profile.currentSpecies];
      if (!details) continue;
      const matchups = getTypeMatchups(details.types);
      for (const type of ALL_TYPES) {
        const multiplier = matchups[type] ?? 1;
        if (multiplier === 0) coverage[type].immune += 1;
        else if (multiplier > 1) coverage[type].weak += 1;
        else if (multiplier < 1) coverage[type].resist += 1;
      }
    }
    return coverage;
  }, [dataset, partyMembers]);

  const startRenaming = (boxIndex: number) => {
    setBoxNameDraft(boxesData[boxIndex]?.name ?? "");
    setRenamingBoxIndex(boxIndex);
  };

  const commitRename = (boxIndex: number) => {
    const trimmed = boxNameDraft.trim();
    setBoxesData((current) =>
      current.map((box, i) => (i === boxIndex ? { ...box, name: trimmed || box.name } : box)),
    );
    setRenamingBoxIndex(null);
  };

  const addBox = () => {
    setBoxesData((current) => [...current, createNewBox(current.length)]);
  };

  const removeEmptyBox = (boxIndex: number) => {
    const box = boxesData[boxIndex];
    if (!box || boxesData.length <= 1) {
      return;
    }
    const isEmpty = box.slots.every((slot) => slot === null);
    if (!isEmpty) {
      return;
    }
    setBoxesData((current) => current.filter((_, i) => i !== boxIndex));
  };

  const getSlotProfileId = (location: SlotLocation): string | null =>
    location.kind === "box" ? boxesData[location.boxIndex]?.slots[location.slotIndex] ?? null : partyData[location.slotIndex] ?? null;

  const setSlotProfileId = (location: SlotLocation, profileId: string | null) => {
    if (location.kind === "box") {
      setBoxesData((current) =>
        current.map((box, i) =>
          i === location.boxIndex
            ? { ...box, slots: box.slots.map((slot, s) => (s === location.slotIndex ? profileId : slot)) }
            : box,
        ),
      );
    } else {
      setPartyData((current) => current.map((slot, s) => (s === location.slotIndex ? profileId : slot)));
    }
  };

  const locationsEqual = (a: SlotLocation, b: SlotLocation): boolean =>
    a.kind === "party" && b.kind === "party"
      ? a.slotIndex === b.slotIndex
      : a.kind === "box" && b.kind === "box" && a.boxIndex === b.boxIndex && a.slotIndex === b.slotIndex;

  // Swaps whatever is in `source` and `target` (dragging onto an empty slot just moves it).
  const swapSlots = (source: SlotLocation, target: SlotLocation) => {
    if (locationsEqual(source, target)) {
      return;
    }
    const sourceId = getSlotProfileId(source);
    const targetId = getSlotProfileId(target);
    if (!sourceId) {
      return;
    }
    setSlotProfileId(target, sourceId);
    setSlotProfileId(source, targetId);
  };

  const assignProfileToSlot = (location: SlotLocation, profileId: string) => {
    setSlotProfileId(location, profileId);
    setPickerLocation(null);
    setPickerSearch("");
  };

  const clearSlot = (location: SlotLocation) => {
    setSlotProfileId(location, null);
    setActionLocation(null);
  };

  // Fully releases the owned Pokémon: removes it from whichever slot holds it (if any) and
  // deletes its profile entirely.
  const releaseProfileById = (profileId: string) => {
    if (!window.confirm("Release this Pokémon? This permanently deletes its recorded stats.")) {
      return;
    }
    setBoxesData((current) =>
      current.map((box) => ({ ...box, slots: box.slots.map((slot) => (slot === profileId ? null : slot)) })),
    );
    setPartyData((current) => current.map((slot) => (slot === profileId ? null : slot)));
    setCaughtPokemonMap((current) => {
      const next: CaughtPokemonMap = {};
      for (const [species, profiles] of Object.entries(current)) {
        const filtered = profiles.filter((profile) => profile.id !== profileId);
        if (filtered.length > 0) {
          next[species] = filtered;
        }
      }
      return next;
    });
    setActionLocation(null);
  };

  const handleNewProfileSaved = (profile: CaughtPokemonProfile) => {
    setCaughtPokemonMap((current) => ({
      ...current,
      [profile.currentSpecies]: [...(current[profile.currentSpecies] ?? []), profile],
    }));
    if (pickerLocation) {
      setSlotProfileId(pickerLocation, profile.id);
    }
    setNewProfileSpecies(null);
    setPickerLocation(null);
    setPickerSearch("");
  };

  // Applies edits made in the "Configure Owned Pokémon" modal to an existing profile.
  const handleProfileUpdated = (updated: CaughtPokemonProfile) => {
    setCaughtPokemonMap((current) => {
      const next: CaughtPokemonMap = {};
      for (const [species, profiles] of Object.entries(current)) {
        const filtered = profiles.filter((profile) => profile.id !== updated.id);
        if (filtered.length > 0) {
          next[species] = filtered;
        }
      }
      next[updated.currentSpecies] = [...(next[updated.currentSpecies] ?? []), updated];
      return next;
    });
    setEditingProfile(null);
  };

  if (isLoading) {
    return (
      <main className="app-shell">
        <section className="card">
          <h1>Pokedex Boxes</h1>
          <p>Loading Pokedex and Unbound details...</p>
        </section>
      </main>
    );
  }

  if (error) {
    return (
      <main className="app-shell">
        <section className="card">
          <h1>Pokedex Boxes</h1>
          <p className="error-text">{error}</p>
          <button type="button" onClick={() => window.location.reload()}>
            Retry
          </button>
        </section>
      </main>
    );
  }

  const actionProfile = actionLocation ? findProfileById(caughtPokemonMap, getSlotProfileId(actionLocation) ?? "") : null;

  const renderSlot = (location: SlotLocation, key: string, shape: "square" | "circle") => {
    const profileId = getSlotProfileId(location);
    const profile = profileId ? findProfileById(caughtPokemonMap, profileId) : null;
    const shapeClass = shape === "circle" ? "box-slot-circle" : "";
    const isDragOverTarget = Boolean(dragSource) && !locationsEqual(dragSource as SlotLocation, location);
    const commonDragProps = {
      onDragOver: (event: DragEvent) => {
        if (dragSource) event.preventDefault();
      },
      onDrop: (event: DragEvent) => {
        event.preventDefault();
        if (dragSource) {
          swapSlots(dragSource, location);
        }
        setDragSource(null);
      },
    };
    if (!profile) {
      return (
        <button
          key={key}
          type="button"
          className={`box-slot box-slot-empty ${shapeClass} ${isDragOverTarget ? "box-slot-drop-target" : ""}`}
          onClick={() => setPickerLocation(location)}
          {...commonDragProps}
        >
          <span className="box-slot-plus">+</span>
        </button>
      );
    }
    const spriteUrl = dataset?.pokemon[profile.currentSpecies]?.spriteUrl ?? "";
    const displayName = displayNameFor(profile.currentSpecies);
    return (
      <button
        key={key}
        type="button"
        draggable
        className={`box-slot box-slot-filled ${shapeClass} ${isDragOverTarget ? "box-slot-drop-target" : ""}`}
        title={`${displayName} (Lv. ${profile.level}) — drag to move`}
        onClick={() => setActionLocation(location)}
        onDragStart={(event) => {
          setDragSource(location);
          event.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => setDragSource(null)}
        {...commonDragProps}
      >
        <SpriteImage speciesKey={profile.currentSpecies} fallbackUrl={spriteUrl} alt={displayName} className="box-sprite" />
        <span className="box-slot-level">Lv{profile.level}</span>
      </button>
    );
  };

  return (
    <main className="app-shell">
      <section className="card">
        <header className="header">
          <div className="header-top-row">
            <div>
              <h1>Pokedex Boxes</h1>
              <p className="subtitle">Store and organize your caught Pokemon, PC-box style.</p>
            </div>
            {cloudSync.isCloudEnabled && cloudSync.user && (
              <span className={`sync-status sync-status-${cloudSync.syncStatus}`}>
                {cloudSync.syncStatus === "syncing" ? "Syncing…" : "Synced"}
              </span>
            )}
          </div>
        </header>

        <Link to="/" className="back-link">← Back to Pokédex</Link>

        <section className="progress-card">
          <strong>Boxed: {totalBoxed}/{totalCaught} owned Pokemon</strong>
        </section>

        <section className="party-section">
          <h2 className="party-title">Party</h2>
          <div className="party-grid">
            {Array.from({ length: PARTY_SLOT_COUNT }, (_, slotIndex) =>
              renderSlot({ kind: "party", slotIndex }, `party-${slotIndex}`, "circle"),
            )}
          </div>
        </section>

        {partyMembers.length > 0 ? (
          <section className="team-overview-section">
            <h2 className="party-title">Team Overview</h2>

            <div className="team-roster">
              {partyMembers.map((profile) => {
                const details = dataset?.pokemon[profile.currentSpecies];
                const stats = partyMemberStats.get(profile.id);
                const spriteUrl = details?.spriteUrl ?? "";
                const displayName = displayNameFor(profile.currentSpecies);
                return (
                  <div key={profile.id} className="team-roster-card">
                    <div className="team-roster-card-header">
                      <SpriteImage speciesKey={profile.currentSpecies} fallbackUrl={spriteUrl} alt={displayName} className="box-sprite" />
                      <div>
                        <div className="team-roster-name">{displayName} <span className="muted">Lv. {profile.level}</span></div>
                        <div className="pokemon-row-types">
                          {(details?.types ?? []).map((type) => (
                            <span key={type} className="type-chip" style={{ background: getTypeColor(type), color: getTypeTextColor(type) }}>
                              {getDisplayToken(type)}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    {stats ? (
                      <div className="team-roster-stats">
                        {([
                          ["HP", stats.hp], ["Atk", stats.attack], ["Def", stats.defense],
                          ["SpA", stats.spAttack], ["SpD", stats.spDefense], ["Spe", stats.speed], ["BST", stats.total],
                        ] as const).map(([label, value]) => (
                          <span key={label} className="team-roster-stat">{label} <strong>{value}</strong></span>
                        ))}
                      </div>
                    ) : null}
                    <div className="team-roster-moves">
                      {profile.moveset.map((moveKey) => (
                        <span key={moveKey} className="tag-button">{dataset?.moves[moveKey]?.name ?? getDisplayToken(moveKey)}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="team-totals-card">
              <h3>Team Stat Totals</h3>
              <div className="team-roster-stats">
                {([
                  ["HP", teamStatTotals.hp], ["Atk", teamStatTotals.attack], ["Def", teamStatTotals.defense],
                  ["SpA", teamStatTotals.spAttack], ["SpD", teamStatTotals.spDefense], ["Spe", teamStatTotals.speed],
                  ["Grand Total", teamStatTotals.total],
                ] as const).map(([label, value]) => (
                  <span key={label} className="team-roster-stat">{label} <strong>{value}</strong></span>
                ))}
              </div>
            </div>

            <div className="team-type-coverage">
              <h3>Team Type Coverage</h3>
              <p className="muted">How many of your party members are weak to, resist, or are immune to each attacking type.</p>
              <div className="type-coverage-grid">
                {ALL_TYPES.map((type) => {
                  const coverage = teamTypeCoverage[type];
                  return (
                    <div key={type} className="type-coverage-row">
                      <span className="type-chip" style={{ background: getTypeColor(type), color: getTypeTextColor(type) }}>
                        {getDisplayToken(type)}
                      </span>
                      <span className="type-coverage-counts">
                        {coverage.weak > 0 ? <span className="type-coverage-weak">{coverage.weak} weak</span> : null}
                        {coverage.resist > 0 ? <span className="type-coverage-resist">{coverage.resist} resist</span> : null}
                        {coverage.immune > 0 ? <span className="type-coverage-immune">{coverage.immune} immune</span> : null}
                        {coverage.weak === 0 && coverage.resist === 0 && coverage.immune === 0 ? <span className="muted">—</span> : null}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        ) : null}

        {unassignedProfiles.length > 0 ? (
          <section className="unassigned-section">
            <h2 className="party-title">Unassigned Owned Pokémon</h2>
            <p className="muted">Not currently placed in a box or party slot.</p>
            <div className="unassigned-list">
              {unassignedProfiles.map((profile) => {
                const spriteUrl = dataset?.pokemon[profile.currentSpecies]?.spriteUrl ?? "";
                const displayName = displayNameFor(profile.currentSpecies);
                return (
                  <div key={profile.id} className="unassigned-item">
                    <SpriteImage speciesKey={profile.currentSpecies} fallbackUrl={spriteUrl} alt={displayName} className="box-sprite" />
                    <span className="box-picker-item-name">{displayName}</span>
                    <span className="box-picker-item-level">Lv. {profile.level}</span>
                    <button type="button" className="status-pill" onClick={() => setEditingProfile(profile)}>
                      Edit Stats
                    </button>
                    <button type="button" className="status-pill btn-danger" onClick={() => releaseProfileById(profile.id)}>
                      Release
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        <section className="boxes-list">
          {boxesData.map((box, boxIndex) => {
            const isEmpty = box.slots.every((slot) => slot === null);
            return (
              <div key={boxIndex} className="box-card">
                <div className="box-card-header">
                  {renamingBoxIndex === boxIndex ? (
                    <input
                      type="text"
                      className="box-name-input"
                      value={boxNameDraft}
                      autoFocus
                      onChange={(event) => setBoxNameDraft(event.target.value)}
                      onBlur={() => commitRename(boxIndex)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          commitRename(boxIndex);
                        } else if (event.key === "Escape") {
                          setRenamingBoxIndex(null);
                        }
                      }}
                    />
                  ) : (
                    <button type="button" className="box-name-btn" onClick={() => startRenaming(boxIndex)}>
                      {box.name}
                    </button>
                  )}
                  {isEmpty && boxesData.length > 1 && (
                    <button
                      type="button"
                      className="box-toolbar-btn box-toolbar-btn-danger box-remove-btn"
                      onClick={() => removeEmptyBox(boxIndex)}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="box-grid" style={{ gridTemplateColumns: `repeat(${BOX_COLUMNS}, 1fr)` }}>
                  {Array.from({ length: BOX_SLOT_COUNT }, (_, slotIndex) =>
                    renderSlot({ kind: "box", boxIndex, slotIndex }, `${boxIndex}-${slotIndex}`, "square"),
                  )}
                </div>
              </div>
            );
          })}
          <button type="button" className="box-toolbar-btn box-add-box-btn" onClick={addBox}>
            + Add Box
          </button>
        </section>
      </section>

      {pickerLocation && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setPickerLocation(null)}>
          <section className="modal-card box-picker-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Add Pokemon</h3>
            <input
              type="text"
              className="box-picker-search"
              placeholder="Search Pokemon..."
              value={pickerSearch}
              onChange={(event) => setPickerSearch(event.target.value)}
              autoFocus
            />

            {availableProfiles.length > 0 ? (
              <>
                <p className="box-picker-section-label">Assign an owned Pokémon</p>
                <div className="box-picker-list">
                  {availableProfiles.map((profile) => {
                    const spriteUrl = dataset?.pokemon[profile.currentSpecies]?.spriteUrl ?? "";
                    const displayName = displayNameFor(profile.currentSpecies);
                    return (
                      <button
                        key={profile.id}
                        type="button"
                        className="box-picker-item"
                        onClick={() => assignProfileToSlot(pickerLocation, profile.id)}
                      >
                        <SpriteImage speciesKey={profile.currentSpecies} fallbackUrl={spriteUrl} alt={displayName} className="box-sprite" />
                        <span className="box-picker-item-name">{displayName}</span>
                        <span className="box-picker-item-level">Lv. {profile.level}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}

            <p className="box-picker-section-label">Add a new owned Pokémon</p>
            {caughtSpeciesOptions.length === 0 ? (
              <p className="muted">
                No caught Pokémon to add yet. Mark a Pokémon as caught (pokeball button) on the main Pokédex page first.
              </p>
            ) : (
              <div className="box-picker-list">
                {caughtSpeciesOptions.map((entry) => {
                  const spriteUrl = dataset?.pokemon[entry.id]?.spriteUrl ?? "";
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      className="box-picker-item"
                      onClick={() => setNewProfileSpecies(entry.id)}
                    >
                      <SpriteImage speciesKey={entry.id} fallbackUrl={spriteUrl} alt={entry.displayName} className="box-sprite" />
                      <span className="box-picker-item-name">{entry.displayName}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="modal-actions">
              <button type="button" className="status-pill" onClick={() => setPickerLocation(null)}>Cancel</button>
            </div>
          </section>
        </div>
      )}

      {newProfileSpecies && dataset ? (
        <CaughtProfileModal
          dataset={dataset}
          entries={entries}
          originalSpecies={newProfileSpecies}
          onSave={handleNewProfileSaved}
          onClose={() => setNewProfileSpecies(null)}
        />
      ) : null}

      {editingProfile && dataset ? (
        <CaughtProfileModal
          dataset={dataset}
          entries={entries}
          originalSpecies={editingProfile.currentSpecies}
          initialProfile={editingProfile}
          onSave={handleProfileUpdated}
          onClose={() => setEditingProfile(null)}
        />
      ) : null}

      {actionLocation && actionProfile && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setActionLocation(null)}>
          <section className="modal-card" onClick={(event) => event.stopPropagation()}>
            <h3>{displayNameFor(actionProfile.currentSpecies)}</h3>
            <p className="muted">Level {actionProfile.level}</p>
            <div className="box-action-buttons">
              <button
                type="button"
                className="account-btn account-btn-primary"
                onClick={() => {
                  setEditingProfile(actionProfile);
                  setActionLocation(null);
                }}
              >
                Edit Stats
              </button>
              <button
                type="button"
                className="account-btn"
                onClick={() => navigate(`/pokemon/${actionProfile.currentSpecies}`)}
              >
                View Species Page
              </button>
              <button
                type="button"
                className="account-btn box-toolbar-btn-danger"
                onClick={() => clearSlot(actionLocation)}
              >
                Remove from {actionLocation.kind === "party" ? "Party" : "Box"}
              </button>
              <button
                type="button"
                className="account-btn box-toolbar-btn-danger"
                onClick={() => releaseProfileById(actionProfile.id)}
              >
                Release
              </button>
            </div>
            <div className="modal-actions">
              <button type="button" className="status-pill" onClick={() => setActionLocation(null)}>Close</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
