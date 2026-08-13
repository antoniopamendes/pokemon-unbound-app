import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SpriteImage } from "./App";
import { fetchUnboundPokedex } from "./pokedex";
import {
  BOX_COLUMNS,
  BOX_SLOT_COUNT,
  createNewBox,
  loadBoxesData,
  loadCaughtPokemonMap,
  saveBoxesData,
} from "./storage";
import { getDisplayToken, getUnboundDataset } from "./unboundData";
import { useCloudSync } from "./useCloudSync";
import type {
  BoxesData,
  CaughtPokemonMap,
  CaughtPokemonProfile,
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

export default function BoxesPage() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<PokemonEntry[]>([]);
  const [dataset, setDataset] = useState<UnboundDataset | null>(null);
  const [caughtPokemonMap, setCaughtPokemonMap] = useState<CaughtPokemonMap>(() => loadCaughtPokemonMap());
  const [boxesData, setBoxesData] = useState<BoxesData>(() => loadBoxesData());
  const [activeBoxIndex, setActiveBoxIndex] = useState(0);
  const [renamingBox, setRenamingBox] = useState(false);
  const [boxNameDraft, setBoxNameDraft] = useState("");
  const [pickerSlotIndex, setPickerSlotIndex] = useState<number | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [actionSlotIndex, setActionSlotIndex] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cloudSync = useCloudSync({ caughtPokemonMap, setCaughtPokemonMap, boxesData, setBoxesData });

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

  const displayNameFor = (speciesId: string) => getDisplayToken(speciesId.replace("SPECIES_", ""));

  // Every profile id currently placed in any box, across all boxes.
  const assignedProfileIds = useMemo(() => {
    const set = new Set<string>();
    for (const box of boxesData) {
      for (const slot of box.slots) {
        if (slot) {
          set.add(slot);
        }
      }
    }
    return set;
  }, [boxesData]);

  const allProfiles = useMemo(
    () => Object.values(caughtPokemonMap).flat(),
    [caughtPokemonMap],
  );

  const availableProfiles = useMemo(() => {
    const unassigned = allProfiles.filter((profile) => !assignedProfileIds.has(profile.id));
    const query = pickerSearch.trim().toLowerCase();
    if (!query) {
      return unassigned;
    }
    return unassigned.filter((profile) => displayNameFor(profile.currentSpecies).toLowerCase().includes(query));
  }, [allProfiles, assignedProfileIds, pickerSearch]);

  const activeBox = boxesData[activeBoxIndex] ?? null;
  const totalCaught = allProfiles.length;
  const totalBoxed = assignedProfileIds.size;

  const goToPrevBox = () => setActiveBoxIndex((i) => (i - 1 + boxesData.length) % boxesData.length);
  const goToNextBox = () => setActiveBoxIndex((i) => (i + 1) % boxesData.length);

  const startRenaming = () => {
    setBoxNameDraft(activeBox?.name ?? "");
    setRenamingBox(true);
  };

  const commitRename = () => {
    const trimmed = boxNameDraft.trim();
    setBoxesData((current) =>
      current.map((box, i) => (i === activeBoxIndex ? { ...box, name: trimmed || box.name } : box)),
    );
    setRenamingBox(false);
  };

  const addBox = () => {
    setBoxesData((current) => [...current, createNewBox(current.length)]);
    setActiveBoxIndex(boxesData.length);
  };

  const removeEmptyActiveBox = () => {
    if (!activeBox || boxesData.length <= 1) {
      return;
    }
    const isEmpty = activeBox.slots.every((slot) => slot === null);
    if (!isEmpty) {
      return;
    }
    setBoxesData((current) => current.filter((_, i) => i !== activeBoxIndex));
    setActiveBoxIndex((i) => Math.max(0, i - 1));
  };

  const assignProfileToSlot = (slotIndex: number, profileId: string) => {
    setBoxesData((current) =>
      current.map((box, i) =>
        i === activeBoxIndex
          ? { ...box, slots: box.slots.map((slot, s) => (s === slotIndex ? profileId : slot)) }
          : box,
      ),
    );
    setPickerSlotIndex(null);
    setPickerSearch("");
  };

  const clearSlot = (slotIndex: number) => {
    setBoxesData((current) =>
      current.map((box, i) =>
        i === activeBoxIndex ? { ...box, slots: box.slots.map((slot, s) => (s === slotIndex ? null : slot)) } : box,
      ),
    );
    setActionSlotIndex(null);
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

  const actionSlotProfile =
    actionSlotIndex != null && activeBox?.slots[actionSlotIndex]
      ? findProfileById(caughtPokemonMap, activeBox.slots[actionSlotIndex]!)
      : null;

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
          <strong>Boxed: {totalBoxed}/{totalCaught} caught Pokemon</strong>
        </section>

        <section className="box-toolbar">
          <button type="button" className="box-nav-btn" onClick={goToPrevBox} aria-label="Previous box">
            ‹
          </button>
          {renamingBox ? (
            <input
              type="text"
              className="box-name-input"
              value={boxNameDraft}
              autoFocus
              onChange={(event) => setBoxNameDraft(event.target.value)}
              onBlur={commitRename}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  commitRename();
                } else if (event.key === "Escape") {
                  setRenamingBox(false);
                }
              }}
            />
          ) : (
            <button type="button" className="box-name-btn" onClick={startRenaming}>
              {activeBox?.name ?? "Box"}
            </button>
          )}
          <button type="button" className="box-nav-btn" onClick={goToNextBox} aria-label="Next box">
            ›
          </button>
          <span className="box-index-label">
            {activeBoxIndex + 1} / {boxesData.length}
          </span>
          <button type="button" className="box-toolbar-btn" onClick={addBox}>
            + Add Box
          </button>
          {activeBox?.slots.every((slot) => slot === null) && boxesData.length > 1 && (
            <button type="button" className="box-toolbar-btn box-toolbar-btn-danger" onClick={removeEmptyActiveBox}>
              Remove Empty Box
            </button>
          )}
        </section>

        <section className="box-grid" style={{ gridTemplateColumns: `repeat(${BOX_COLUMNS}, 1fr)` }}>
          {Array.from({ length: BOX_SLOT_COUNT }, (_, slotIndex) => {
            const profileId = activeBox?.slots[slotIndex] ?? null;
            const profile = profileId ? findProfileById(caughtPokemonMap, profileId) : null;
            if (!profile) {
              return (
                <button
                  key={slotIndex}
                  type="button"
                  className="box-slot box-slot-empty"
                  onClick={() => setPickerSlotIndex(slotIndex)}
                >
                  <span className="box-slot-plus">+</span>
                </button>
              );
            }
            const spriteUrl = dataset?.pokemon[profile.currentSpecies]?.spriteUrl ?? "";
            const displayName = displayNameFor(profile.currentSpecies);
            return (
              <button
                key={slotIndex}
                type="button"
                className="box-slot box-slot-filled"
                title={`${displayName} (Lv. ${profile.level})`}
                onClick={() => setActionSlotIndex(slotIndex)}
              >
                <SpriteImage speciesKey={profile.currentSpecies} fallbackUrl={spriteUrl} alt={displayName} className="box-sprite" />
                <span className="box-slot-level">Lv{profile.level}</span>
              </button>
            );
          })}
        </section>
      </section>

      {pickerSlotIndex != null && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setPickerSlotIndex(null)}>
          <section className="modal-card box-picker-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Add Pokemon to Box</h3>
            <input
              type="text"
              className="box-picker-search"
              placeholder="Search caught Pokemon..."
              value={pickerSearch}
              onChange={(event) => setPickerSearch(event.target.value)}
              autoFocus
            />
            <div className="box-picker-list">
              {availableProfiles.length === 0 ? (
                <p className="muted">
                  {allProfiles.length === 0
                    ? "You haven't caught any Pokemon yet."
                    : "No unboxed caught Pokemon match your search."}
                </p>
              ) : (
                availableProfiles.map((profile) => {
                  const spriteUrl = dataset?.pokemon[profile.currentSpecies]?.spriteUrl ?? "";
                  const displayName = displayNameFor(profile.currentSpecies);
                  return (
                    <button
                      key={profile.id}
                      type="button"
                      className="box-picker-item"
                      onClick={() => assignProfileToSlot(pickerSlotIndex, profile.id)}
                    >
                      <SpriteImage speciesKey={profile.currentSpecies} fallbackUrl={spriteUrl} alt={displayName} className="box-sprite" />
                      <span className="box-picker-item-name">{displayName}</span>
                      <span className="box-picker-item-level">Lv. {profile.level}</span>
                    </button>
                  );
                })
              )}
            </div>
            <div className="modal-actions">
              <button type="button" className="status-pill" onClick={() => setPickerSlotIndex(null)}>Cancel</button>
            </div>
          </section>
        </div>
      )}

      {actionSlotIndex != null && actionSlotProfile && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setActionSlotIndex(null)}>
          <section className="modal-card" onClick={(event) => event.stopPropagation()}>
            <h3>{displayNameFor(actionSlotProfile.currentSpecies)}</h3>
            <p className="muted">Level {actionSlotProfile.level}</p>
            <div className="box-action-buttons">
              <button
                type="button"
                className="account-btn account-btn-primary"
                onClick={() => navigate(`/pokemon/${actionSlotProfile.currentSpecies}`)}
              >
                View Details
              </button>
              <button
                type="button"
                className="account-btn box-toolbar-btn-danger"
                onClick={() => clearSlot(actionSlotIndex)}
              >
                Remove from Box
              </button>
            </div>
            <div className="modal-actions">
              <button type="button" className="status-pill" onClick={() => setActionSlotIndex(null)}>Close</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
