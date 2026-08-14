import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, PointerEvent as ReactPointerEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SpriteImage, usePopover } from "./App";
import { CaughtProfileModal } from "./CaughtProfileModal";
import { parseBoxImport, profileFromImport, rebindBoxImportRow, type BoxImportRow } from "./boxImport";
import { fetchUnboundPokedex } from "./pokedex";
import { BUILD_STATS, NATURE_BY_NAME, formatNatureLabel, sumSpread } from "./pokemonBuild";
import { calculateCaughtPokemonStats, getNatureModifiers } from "./statCalculator";
import {
  BOX_COLUMNS,
  BOX_SLOT_COUNT,
  LOCAL_DATA_CHANGED_EVENT,
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
import { getTypeColor, getTypeTextColor } from "./typeColors";
import { speciesIdToSlug } from "./speciesSlug";
import { ALL_TYPES, getAbilityAdjustedTypeMatchups } from "./typeEffectiveness";
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
  const { show: popShow, move: popMove, hide: popHide, toggle: popToggle, popoverEl } = usePopover();
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
  const [importBoxIndex, setImportBoxIndex] = useState<number | null>(null);
  const [importText, setImportText] = useState("");
  const [importRows, setImportRows] = useState<BoxImportRow[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importProcessed, setImportProcessed] = useState(false);
  const [importPickerRowIndex, setImportPickerRowIndex] = useState<number | null>(null);
  const [importPickerSearch, setImportPickerSearch] = useState("");
  const [dragSource, setDragSource] = useState<SlotLocation | null>(null);
  const [dragTarget, setDragTarget] = useState<SlotLocation | null>(null);
  const pointerDragRef = useRef<{
    source: SlotLocation;
    pointerId: number;
    startX: number;
    startY: number;
    active: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const [teamOverviewCollapsed, setTeamOverviewCollapsed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  useEffect(() => {
    const onLocalDataChanged = () => {
      setCaughtPokemonMap(loadCaughtPokemonMap());
      setCaughtSpeciesMap(loadCaughtSpeciesMap());
      setBoxesData(loadBoxesData());
      setPartyData(loadPartyData());
    };
    window.addEventListener(LOCAL_DATA_CHANGED_EVENT, onLocalDataChanged);
    return () => window.removeEventListener(LOCAL_DATA_CHANGED_EVENT, onLocalDataChanged);
  }, []);

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

  const importAvailableSlots = importBoxIndex === null
    ? 0
    : (boxesData[importBoxIndex]?.slots.filter((slot) => slot === null).length ?? 0);
  const importIncludedRows = importRows.filter((row) => row.include && row.errors.length === 0 && row.speciesId);
  const importSpeciesOptions = useMemo(() => {
    const query = importPickerSearch.trim().toLowerCase();
    return entries
      .filter((entry) => !query || entry.displayName.toLowerCase().includes(query) || entry.rawKey.toLowerCase().includes(query))
      .sort((a, b) => a.dexOrder - b.dexOrder);
  }, [entries, importPickerSearch]);

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

  // For each attacking type, count effective defensive coverage across the party.
  // 2x weaknesses and 1/2x resistances are worth one point; 4x weaknesses and
  // 1/4x resistances are worth four; immunities are worth two resist points.
  const teamTypeCoverage = useMemo(() => {
    const coverage: Record<string, {
      weak: number;
      resist: number;
      immune: number;
      weakPoints: number;
      resistPoints: number;
    }> = {};
    for (const type of ALL_TYPES) {
      coverage[type] = { weak: 0, resist: 0, immune: 0, weakPoints: 0, resistPoints: 0 };
    }
    if (!dataset) return coverage;
    for (const profile of partyMembers) {
      const details = dataset.pokemon[profile.currentSpecies];
      if (!details) continue;
      const matchups = getAbilityAdjustedTypeMatchups(details.types, profile.ability);
      for (const type of ALL_TYPES) {
        const multiplier = matchups[type] ?? 1;
        if (multiplier === 0) {
          coverage[type].immune += 1;
          coverage[type].resistPoints += 2;
        } else if (multiplier > 1) {
          coverage[type].weak += 1;
          coverage[type].weakPoints += multiplier >= 4 ? 4 : 1;
        } else if (multiplier < 1) {
          coverage[type].resist += 1;
          coverage[type].resistPoints += multiplier <= 0.25 ? 4 : 1;
        }
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

  const locationFromPoint = (clientX: number, clientY: number): SlotLocation | null => {
    const element = document.elementFromPoint(clientX, clientY);
    const slotElement = element instanceof Element
      ? element.closest<HTMLElement>("[data-box-slot]")
      : null;
    if (!slotElement) {
      return null;
    }
    const slotIndex = Number(slotElement.dataset.slotIndex);
    if (!Number.isInteger(slotIndex) || slotIndex < 0) {
      return null;
    }
    if (slotElement.dataset.slotKind === "party") {
      return { kind: "party", slotIndex };
    }
    if (slotElement.dataset.slotKind === "box") {
      const boxIndex = Number(slotElement.dataset.boxIndex);
      if (Number.isInteger(boxIndex) && boxIndex >= 0) {
        return { kind: "box", boxIndex, slotIndex };
      }
    }
    return null;
  };

  const clearPointerDrag = (event?: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = pointerDragRef.current;
    if (gesture && event?.currentTarget.hasPointerCapture(gesture.pointerId)) {
      event.currentTarget.releasePointerCapture(gesture.pointerId);
    }
    pointerDragRef.current = null;
    setDragSource(null);
    setDragTarget(null);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>, location: SlotLocation) => {
    // A new pointer sequence means any suppression from a prior completed drag
    // is no longer needed (some browsers do not synthesize a click after a drag).
    suppressClickRef.current = false;
    if (!event.isPrimary) {
      return;
    }
    if (event.pointerType === "mouse") {
      return;
    }
    pointerDragRef.current = {
      source: location,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = pointerDragRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }
    if (!gesture.active) {
      const distance = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);
      if (distance < 8) {
        return;
      }
      gesture.active = true;
      setDragSource(gesture.source);
    }
    event.preventDefault();
    const target = locationFromPoint(event.clientX, event.clientY);
    setDragTarget(target && !locationsEqual(gesture.source, target) ? target : null);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = pointerDragRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }
    if (gesture.active) {
      event.preventDefault();
      const target = locationFromPoint(event.clientX, event.clientY);
      if (target) {
        swapSlots(gesture.source, target);
      }
      suppressClickRef.current = true;
    }
    clearPointerDrag(event);
  };

  const handlePointerCancel = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = pointerDragRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }
    // Pointer cancellation does not complete a drag and normally does not
    // synthesize a click, so do not leave the next legitimate tap suppressed.
    suppressClickRef.current = false;
    clearPointerDrag(event);
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

  // Fully releases every owned Pokémon currently stored in a box. Profile ids are
  // de-duplicated so a malformed box cannot cause the same profile to be counted twice.
  const releaseAllFromBox = (boxIndex: number) => {
    const box = boxesData[boxIndex];
    if (!box) return;
    const profileIds = new Set(box.slots.filter((slot): slot is string => Boolean(slot)));
    if (profileIds.size === 0) return;

    if (!window.confirm(`Release all ${profileIds.size} Pokémon from ${box.name}? This permanently deletes their recorded stats.`)) {
      return;
    }

    setBoxesData((current) =>
      current.map((currentBox) => ({
        ...currentBox,
        slots: currentBox.slots.map((slot) => (slot && profileIds.has(slot) ? null : slot)),
      })),
    );
    setPartyData((current) => current.map((slot) => (slot && profileIds.has(slot) ? null : slot)));
    setCaughtPokemonMap((current) => {
      const next: CaughtPokemonMap = {};
      for (const [species, profiles] of Object.entries(current)) {
        const filtered = profiles.filter((profile) => !profileIds.has(profile.id));
        if (filtered.length > 0) {
          next[species] = filtered;
        }
      }
      return next;
    });
    if (actionLocation) {
      const actionProfileId = getSlotProfileId(actionLocation);
      if (actionProfileId && profileIds.has(actionProfileId)) {
        setActionLocation(null);
      }
    }
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

  const openImport = (boxIndex: number) => {
    setImportBoxIndex(boxIndex);
    setImportText("");
    setImportRows([]);
    setImportErrors([]);
    setImportProcessed(false);
    setImportPickerRowIndex(null);
    setImportPickerSearch("");
  };

  const closeImport = () => {
    setImportBoxIndex(null);
    setImportText("");
    setImportRows([]);
    setImportErrors([]);
    setImportProcessed(false);
    setImportPickerRowIndex(null);
    setImportPickerSearch("");
  };

  const processImportText = () => {
    const result = parseBoxImport(importText, entries, dataset ?? { pokemon: {}, moves: {}, abilities: {}, items: {} }, caughtSpeciesMap, allProfiles);
    setImportRows(result.rows);
    setImportErrors(result.errors);
    setImportProcessed(true);
  };

  const updateImportRow = (index: number, update: Partial<BoxImportRow>) => {
    setImportRows((current) => current.map((row) => (row.index === index ? { ...row, ...update } : row)));
  };

  const selectImportSpecies = (rowIndex: number, speciesId: string | null) => {
    const selectedRow = importRows.find((row) => row.index === rowIndex);
    if (!selectedRow || !dataset) return;
    const rebound = rebindBoxImportRow(selectedRow, speciesId, dataset, caughtSpeciesMap, allProfiles);
    setImportRows((current) => current.map((row) => (row.index === rowIndex ? rebound : row)));
    setImportPickerRowIndex(null);
    setImportPickerSearch("");
  };

  const confirmImport = () => {
    if (importBoxIndex === null) return;
    const selected = importRows.filter((row) => row.include && row.errors.length === 0 && row.speciesId);
    if (selected.length === 0) {
      setImportErrors(["Select at least one valid Pokémon to import."]);
      return;
    }
    if (selected.length > importAvailableSlots) {
      setImportErrors([`This box has ${importAvailableSlots} empty slot${importAvailableSlots === 1 ? "" : "s"}, but ${selected.length} Pokémon are selected.`]);
      return;
    }
    const profiles = selected.map(profileFromImport);
    const nextCaughtPokemon: CaughtPokemonMap = { ...caughtPokemonMap };
    for (const profile of profiles) {
      nextCaughtPokemon[profile.currentSpecies] = [...(nextCaughtPokemon[profile.currentSpecies] ?? []), profile];
    }
    const nextCaughtSpecies = { ...caughtSpeciesMap };
    selected.forEach((row) => {
      if (row.markCaught && row.speciesId) nextCaughtSpecies[row.speciesId] = true;
    });
    const nextSlots = [...boxesData[importBoxIndex].slots];
    let profileIndex = 0;
    for (let slotIndex = 0; slotIndex < nextSlots.length && profileIndex < profiles.length; slotIndex += 1) {
      if (nextSlots[slotIndex] === null) {
        nextSlots[slotIndex] = profiles[profileIndex].id;
        profileIndex += 1;
      }
    }
    const nextBoxes = boxesData.map((box, index) => index === importBoxIndex ? { ...box, slots: nextSlots } : box);
    setCaughtPokemonMap(nextCaughtPokemon);
    setCaughtSpeciesMap(nextCaughtSpecies);
    setBoxesData(nextBoxes);
    closeImport();
  };

  if (isLoading) {
    return (
      <main className="app-shell">
        <section className="card">
          <p>Loading Pokedex and Unbound details...</p>
        </section>
      </main>
    );
  }

  if (error) {
    return (
      <main className="app-shell">
        <section className="card">
          <p className="error-text">{error}</p>
          <button type="button" onClick={() => window.location.reload()}>
            Retry
          </button>
        </section>
      </main>
    );
  }

  const actionProfile = actionLocation ? findProfileById(caughtPokemonMap, getSlotProfileId(actionLocation) ?? "") : null;
  const actionProfileDetails = actionProfile ? dataset?.pokemon[actionProfile.currentSpecies] ?? null : null;
  const actionProfileStats = actionProfile && actionProfileDetails
    ? calculateCaughtPokemonStats(
        actionProfileDetails.stats,
        actionProfile.level,
        actionProfile.ivs,
        actionProfile.evs,
        getNatureModifiers(NATURE_BY_NAME.get(actionProfile.nature)?.up ?? null, NATURE_BY_NAME.get(actionProfile.nature)?.down ?? null),
      )
    : null;

  const renderSlot = (location: SlotLocation, key: string, shape: "square" | "circle") => {
    const profileId = getSlotProfileId(location);
    const profile = profileId ? findProfileById(caughtPokemonMap, profileId) : null;
    const shapeClass = shape === "circle" ? "box-slot-circle" : "";
    const isDragOverTarget = Boolean(dragTarget) && locationsEqual(dragTarget as SlotLocation, location);
    const commonDragProps = {
      onDragOver: (event: DragEvent) => {
        if (dragSource) {
          event.preventDefault();
          setDragTarget(location);
        }
      },
      onDragEnter: () => {
        if (dragSource) {
          setDragTarget(location);
        }
      },
      onDrop: (event: DragEvent) => {
        event.preventDefault();
        if (dragSource) {
          swapSlots(dragSource, location);
        }
        setDragSource(null);
        setDragTarget(null);
      },
    };
    if (!profile) {
      return (
        <button
          key={key}
          type="button"
          className={`box-slot box-slot-empty ${shapeClass} ${isDragOverTarget ? "box-slot-drop-target" : ""}`}
          onClick={() => setPickerLocation(location)}
          data-box-slot="true"
          data-slot-kind={location.kind}
          data-box-index={location.kind === "box" ? location.boxIndex : undefined}
          data-slot-index={location.slotIndex}
          {...commonDragProps}
        >
          <span className="box-slot-plus">+</span>
        </button>
      );
    }
    const spriteUrl = dataset?.pokemon[profile.currentSpecies]?.spriteUrl ?? "";
    const speciesName = displayNameFor(profile.currentSpecies);
    const displayName = profile.nickname?.trim() || speciesName;
    return (
      <button
        key={key}
        type="button"
        draggable
        className={`box-slot box-slot-filled ${shapeClass} ${isDragOverTarget ? "box-slot-drop-target" : ""}`}
        title={`${displayName}${displayName !== speciesName ? ` (${speciesName})` : ""} (Lv. ${profile.level}) — drag to move`}
        onClick={() => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
          }
          setActionLocation(location);
        }}
        onPointerDown={(event) => handlePointerDown(event, location)}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onLostPointerCapture={handlePointerCancel}
        data-box-slot="true"
        data-slot-kind={location.kind}
        data-box-index={location.kind === "box" ? location.boxIndex : undefined}
        data-slot-index={location.slotIndex}
        onDragStart={(event) => {
          setDragSource(location);
          setDragTarget(null);
          event.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => {
          setDragSource(null);
          setDragTarget(null);
        }}
        {...commonDragProps}
      >
        <SpriteImage speciesKey={profile.currentSpecies} fallbackUrl={spriteUrl} alt={displayName} className="box-sprite" />
      </button>
    );
  };

  return (
    <main className="app-shell">
      {popoverEl}
      <section className="card">
        <div className="page-back-nav">
          <Link to="/" className="back-link">← Back to Pokédex</Link>
        </div>

        <section className="progress-card">
          <strong>Boxed: {totalBoxed}/{totalCaught} owned Pokemon</strong>
        </section>

        <section className="team-overview-section">
          <div className="details-section-header">
            <button type="button" className="section-toggle" onClick={() => setTeamOverviewCollapsed((current) => !current)}>
              <span className={`chevron ${teamOverviewCollapsed ? "collapsed" : ""}`}>▾</span>
              <h2 className="party-title">Team Overview</h2>
            </button>
          </div>

          <div className="party-grid team-overview-grid">
            {Array.from({ length: PARTY_SLOT_COUNT }, (_, slotIndex) => {
              const location: SlotLocation = { kind: "party", slotIndex };
              const profileId = getSlotProfileId(location);
              const profile = profileId ? findProfileById(caughtPokemonMap, profileId) : null;
              const details = profile ? dataset?.pokemon[profile.currentSpecies] : null;
              const stats = profile ? partyMemberStats.get(profile.id) : null;
              const displayName = profile ? displayNameFor(profile.currentSpecies) : null;
              return (
                <div key={slotIndex} className="team-overview-slot">
                  {renderSlot(location, `party-${slotIndex}`, "circle")}
                  {!teamOverviewCollapsed && profile ? (
                    <div className="team-roster-card team-roster-card-vertical">
                      <div className="team-roster-name">{profile.nickname?.trim() || displayName} {profile.nickname?.trim() ? <span className="muted">({displayName})</span> : null} <span className="muted">Lv. {profile.level}</span>{profile.shiny ? <span className="shiny-badge">★</span> : null}</div>
                      <div className="pokemon-row-types">
                        {(details?.types ?? []).map((type) => (
                          <span key={type} className="type-chip" style={{ background: getTypeColor(type), color: getTypeTextColor(type) }}>
                            {getDisplayToken(type)}
                          </span>
                        ))}
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
                        {profile.moveset.map((moveKey) => {
                          const moveInfo = dataset?.moves[moveKey];
                          return (
                            <span
                              key={moveKey}
                              className="tag-button"
                              data-popover-trigger="true"
                              onMouseEnter={(e) => moveInfo && popShow(e, { kind: "move", info: moveInfo })}
                              onMouseMove={popMove}
                              onMouseLeave={popHide}
                              onClick={(e) => moveInfo && popToggle(e, { kind: "move", info: moveInfo })}
                            >
                              {moveInfo?.name ?? getDisplayToken(moveKey)}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {!teamOverviewCollapsed && partyMembers.length > 0 ? (
            <div className="team-overview-summaries">
              <div className="team-summary-card team-totals-card">
                <h3>Team Stat Totals</h3>
                <div className="stats-grid">
                  {(() => {
                    const rows: [string, number][] = [
                      ["HP", teamStatTotals.hp], ["Atk", teamStatTotals.attack], ["Def", teamStatTotals.defense],
                      ["SpA", teamStatTotals.spAttack], ["SpD", teamStatTotals.spDefense], ["Spe", teamStatTotals.speed],
                    ];
                    const maxValue = Math.max(1, ...rows.map(([, value]) => value));
                    return (
                      <>
                        {rows.map(([label, value]) => (
                          <div key={label} className="stat-row">
                            <span className="stat-label">{label}</span>
                            <span className="stat-bar-wrap">
                              <span className="stat-bar" style={{ width: `${Math.min(100, Math.round((value / maxValue) * 100))}%` }} />
                            </span>
                            <span className="stat-value">{value}</span>
                          </div>
                        ))}
                        <div className="stat-row">
                          <span className="stat-label">Total</span>
                          <span className="stat-bar-wrap">
                            <span className="stat-bar" style={{ width: "100%" }} />
                          </span>
                          <span className="stat-value">{teamStatTotals.total}</span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              <div className="team-summary-card team-type-coverage">
                <h3>Team Type Coverage</h3>
                <p className="muted">Effective defensive coverage by attacking type. 4× weaknesses and ¼× resistances count four points; immunities count two.</p>
                <div className="type-coverage-grid">
                  {ALL_TYPES.map((type) => {
                    const coverage = teamTypeCoverage[type];
                    const isNeutral = coverage.weakPoints === 0 && coverage.resistPoints === 0;
                    const isWeak = coverage.weakPoints > coverage.resistPoints;
                    const rowState = isNeutral ? "neutral" : isWeak ? "weak" : "covered";
                    return (
                      <div
                        key={type}
                        className={`type-coverage-row type-coverage-row-${rowState}`}
                        aria-label={`${getDisplayToken(type)} ${rowState === "weak" ? "vulnerable" : rowState === "covered" ? "covered" : "neutral"}`}
                      >
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
            </div>
          ) : null}
        </section>

        {unassignedProfiles.length > 0 ? (
          <section className="unassigned-section">
            <h2 className="party-title">Unassigned Owned Pokémon</h2>
            <p className="muted">Not currently placed in a box or party slot.</p>
            <div className="unassigned-list">
              {unassignedProfiles.map((profile) => {
                const spriteUrl = dataset?.pokemon[profile.currentSpecies]?.spriteUrl ?? "";
                const displayName = profile.nickname?.trim() || displayNameFor(profile.currentSpecies);
                return (
                  <div key={profile.id} className="unassigned-item">
                    <SpriteImage speciesKey={profile.currentSpecies} fallbackUrl={spriteUrl} alt={displayName} className="box-sprite" />
                    <span className="box-picker-item-name">{displayName}{profile.shiny ? " ★" : ""}</span>
                    <span className="box-picker-item-level">Lv. {profile.level}</span>
                    <button type="button" className="status-pill" onClick={() => setEditingProfile(profile)}>
                      Edit / Evolve
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
                  <div className="box-card-title-row">
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
                  </div>
                  <div className="box-card-actions">
                    <button type="button" className="box-toolbar-btn" onClick={() => openImport(boxIndex)}>Import</button>
                    {!isEmpty && (
                      <button
                        type="button"
                        className="box-toolbar-btn box-toolbar-btn-danger box-release-all-btn"
                        onClick={() => releaseAllFromBox(boxIndex)}
                      >
                        Release All
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

      {importBoxIndex !== null ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={closeImport}>
          <section className="modal-card box-import-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Import into {boxesData[importBoxIndex]?.name ?? "Box"}</h3>
            <p className="muted">Paste one or more exported Pokémon. Nothing is saved until you review and confirm.</p>
            <textarea
              className="box-import-textarea"
              value={importText}
              onChange={(event) => {
                setImportText(event.target.value);
                setImportProcessed(false);
                setImportRows([]);
                setImportErrors([]);
              }}
              placeholder={'Vanillite (Vanillite) (F)\nAbility: Ice Body\nLevel: 9\n...'}
              rows={10}
            />
            <div className="modal-actions">
              <button type="button" className="btn-primary" onClick={processImportText} disabled={!importText.trim()}>Review import</button>
              <button type="button" className="status-pill" onClick={closeImport}>Cancel</button>
            </div>

            {importProcessed ? (
              <div className="box-import-review">
                <div className="box-import-summary">
                  <strong>{importIncludedRows.length} selected</strong>
                  <span className="muted">{importAvailableSlots} empty slot{importAvailableSlots === 1 ? "" : "s"} available</span>
                </div>
                {importErrors.map((message) => <p key={message} className="error-text">{message}</p>)}
                {importRows.length === 0 ? <p className="muted">No Pokémon were recognized.</p> : null}
                <div className="box-import-list">
                  {importRows.map((row) => {
                    const speciesName = row.speciesId ? displayNameFor(row.speciesId) : row.speciesLabel;
                    const displayName = row.nickname && row.nickname !== row.speciesLabel ? `${row.nickname} (${speciesName})` : speciesName;
                    const canInclude = row.errors.length === 0;
                    return (
                      <div key={`${row.index}-${row.speciesLabel}`} className={`box-import-row ${row.errors.length > 0 ? "box-import-row-invalid" : ""}`}>
                        <div className="box-import-row-main">
                          {row.speciesId ? <SpriteImage speciesKey={row.speciesId} fallbackUrl={dataset?.pokemon[row.speciesId]?.spriteUrl ?? ""} alt={speciesName} className="box-sprite" /> : null}
                          <div className="box-import-row-details">
                            <strong>{displayName}</strong>
                            <span className="muted">Lv. {row.level} · {row.nature}{row.gender ? ` · ${row.gender === "M" ? "Male" : "Female"}` : ""}{row.shiny ? " · Shiny" : ""}</span>
                            <span className="muted">{row.moveLabels.length > 0 ? row.moveLabels.join(", ") : "No moves"}</span>
                            {row.errors.map((message) => <span key={message} className="error-text">{message}</span>)}
                            {row.warnings.map((message) => <span key={message} className="warning-text">{message}</span>)}
                            {row.speciesId ? <span className="box-import-match">Matched to: {speciesName}</span> : null}
                            {importPickerRowIndex === row.index ? (
                              <div className="box-import-species-picker">
                                <input
                                  type="search"
                                  className="box-import-species-search"
                                  value={importPickerSearch}
                                  onChange={(event) => setImportPickerSearch(event.target.value)}
                                  placeholder="Search Pokédex…"
                                  autoFocus
                                />
                                <div className="box-import-species-options">
                                  {importSpeciesOptions.slice(0, 60).map((entry) => (
                                    <button key={entry.id} type="button" className="box-import-species-option" onClick={() => selectImportSpecies(row.index, entry.id)}>
                                      {entry.displayName}
                                    </button>
                                  ))}
                                  {importSpeciesOptions.length === 0 ? <span className="muted">No matching Pokémon.</span> : null}
                                </div>
                                <button type="button" className="status-pill" onClick={() => selectImportSpecies(row.index, null)}>Clear selection</button>
                              </div>
                            ) : (
                              <button type="button" className="box-import-select-btn" onClick={() => { setImportPickerRowIndex(row.index); setImportPickerSearch(row.speciesLabel.split("-")[0]); }}>
                                {row.speciesId ? "Change selection" : "Select Pokémon"}
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="box-import-row-controls">
                          <label className="box-import-include">
                            <input
                              type="checkbox"
                              checked={row.include}
                              disabled={!canInclude || (!row.alreadyCaught && !row.markCaught)}
                              onChange={(event) => updateImportRow(row.index, { include: event.target.checked })}
                            />
                            Include
                          </label>
                          {!row.alreadyCaught && canInclude ? (
                            <label className="box-import-catch">
                              <input
                                type="checkbox"
                                checked={row.markCaught}
                                onChange={(event) => updateImportRow(row.index, { markCaught: event.target.checked, include: event.target.checked })}
                              />
                              Mark as caught
                            </label>
                          ) : (
                            <span className="status-pill status-pill-success">{row.alreadyCaught ? "Caught" : "Needs review"}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn-primary" onClick={confirmImport} disabled={importIncludedRows.length === 0 || importIncludedRows.length > importAvailableSlots}>
                    Import {importIncludedRows.length} Pokémon
                  </button>
                  <button type="button" className="status-pill" onClick={closeImport}>Cancel</button>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

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
                    const displayName = profile.nickname?.trim() || displayNameFor(profile.currentSpecies);
                    return (
                      <button
                        key={profile.id}
                        type="button"
                        className="box-picker-item"
                        onClick={() => assignProfileToSlot(pickerLocation, profile.id)}
                      >
                        <SpriteImage speciesKey={profile.currentSpecies} fallbackUrl={spriteUrl} alt={displayName} className="box-sprite" />
                        <span className="box-picker-item-name">{displayName}{profile.shiny ? " ★" : ""}</span>
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
          <section className="modal-card pokemon-info-card" onClick={(event) => event.stopPropagation()}>
            <div className="pokemon-info-header">
              <SpriteImage
                speciesKey={actionProfile.currentSpecies}
                fallbackUrl={actionProfileDetails?.spriteUrl ?? ""}
                alt={displayNameFor(actionProfile.currentSpecies)}
                className="pokemon-info-sprite"
              />
              <div>
                <h3>{actionProfile.nickname?.trim() || displayNameFor(actionProfile.currentSpecies)}{actionProfile.shiny ? " ★" : ""}</h3>
                <p className="muted">{actionProfile.nickname?.trim() ? `${displayNameFor(actionProfile.currentSpecies)} · ` : ""}Level {actionProfile.level} · {formatNatureLabel(actionProfile.nature)} Nature{actionProfile.gender ? ` · ${actionProfile.gender === "M" ? "Male" : "Female"}` : ""}</p>
                <div className="pokemon-row-types">
                  {(actionProfileDetails?.types ?? []).map((type) => (
                    <span key={type} className="type-chip" style={{ background: getTypeColor(type), color: getTypeTextColor(type) }}>
                      {getDisplayToken(type)}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="header-pill-row">
              <span className="header-pill-group-label">Ability:</span>
              <span className="tag-button">{actionProfile.ability ? (dataset?.abilities[actionProfile.ability]?.name ?? getDisplayToken(actionProfile.ability)) : "—"}</span>
            </div>
            <div className="header-pill-row">
              <span className="header-pill-group-label">Held Item:</span>
              <span className="tag-button">{actionProfile.item ? (dataset?.items[actionProfile.item]?.name ?? getDisplayToken(actionProfile.item)) : "—"}</span>
            </div>
            <div className="header-pill-row">
              <span className="header-pill-group-label">Happiness:</span>
              <span className="tag-button">{actionProfile.happiness ?? "—"}</span>
            </div>

            <h4 className="pokemon-info-subheading">Stats</h4>
            {actionProfileStats ? (
              <div className="stat-config-table-wrap">
                <table className="stat-config-table">
                  <thead>
                    <tr>
                      <th>Stat</th>
                      <th>EV</th>
                      <th>IV</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {BUILD_STATS.map((stat) => (
                      <tr key={stat.key}>
                        <td className="stat-config-label">{stat.label}</td>
                        <td className="stat-config-base">{actionProfile.evs[stat.key]}</td>
                        <td className="stat-config-base">{actionProfile.ivs[stat.key]}</td>
                        <td className="stat-config-value">{actionProfileStats[stat.key]}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Total</td>
                      <td className="stat-config-base">{sumSpread(actionProfile.evs)}/510</td>
                      <td className="stat-config-base">{sumSpread(actionProfile.ivs)}</td>
                      <td className="stat-config-value">{actionProfileStats.total}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : null}

            <h4 className="pokemon-info-subheading">Moveset</h4>
            <div className="moveset-grid">
              {actionProfile.moveset.map((moveKey) => {
                const move = dataset?.moves[moveKey];
                return (
                  <div key={moveKey} className="moveset-card">
                    <div className="moveset-card-name">{move?.name ?? getDisplayToken(moveKey)}</div>
                    <div className="moveset-card-type">
                      <span className="type-chip" style={{ background: getTypeColor(move?.type ?? ""), color: getTypeTextColor(move?.type ?? "") }}>
                        {getDisplayToken(move?.type ?? "—")}
                      </span>
                    </div>
                    <div className="moveset-card-stats">
                      <span>PP {move?.pp ?? "—"}</span>
                      <span>Acc {move && move.accuracy > 0 ? `${move.accuracy}%` : "—"}</span>
                      <span>Pwr {move && move.power > 0 ? move.power : "—"}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="box-action-buttons">
              <button
                type="button"
                className="account-btn account-btn-primary"
                onClick={() => {
                  setEditingProfile(actionProfile);
                  setActionLocation(null);
                }}
              >
                Edit / Evolve
              </button>
              <button
                type="button"
                className="account-btn"
                onClick={() => navigate(`/pokemon/${speciesIdToSlug(actionProfile.currentSpecies)}`)}
              >
                View Pokemon Page
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
