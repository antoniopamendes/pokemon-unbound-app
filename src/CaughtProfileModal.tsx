import { useEffect, useMemo, useState } from "react";
import { fetchPokemonMoveBuckets } from "./pokeApi";
import { getDisplayToken } from "./unboundData";
import { calculateCaughtPokemonStats, getNatureModifiers } from "./statCalculator";
import {
  BUILD_STATS,
  NATURES,
  NATURE_BY_NAME,
  emptySpread,
  formatNatureLabel,
  sumSpread,
  toSlug,
} from "./pokemonBuild";
import type { CaughtPokemonProfile, PokemonEntry, StatSpread, UnboundDataset } from "./types";

type Props = {
  dataset: UnboundDataset;
  entries: PokemonEntry[];
  /** The species this profile is being registered/edited for. */
  originalSpecies: string;
  /** Pass an existing profile to edit it in place; omit to create a brand-new owned Pokémon. */
  initialProfile?: CaughtPokemonProfile | null;
  onSave: (profile: CaughtPokemonProfile) => void;
  onClose: () => void;
};

/**
 * Shared "configure owned Pokémon" modal: level, nature, ability, item, EVs/IVs and moveset.
 * Used both by the main Pokédex page (editing an existing owned instance) and by Pokedex
 * Boxes (creating a brand-new owned instance when placing a caught species into a slot).
 */
export function CaughtProfileModal({ dataset, entries, originalSpecies, initialProfile, onSave, onClose }: Props) {
  const currentSpecies = initialProfile?.currentSpecies || originalSpecies;
  const [level, setLevel] = useState<number>(initialProfile?.level ?? 1);
  const [nature, setNature] = useState<string>(initialProfile?.nature ?? NATURES[0].name);
  const [ability, setAbility] = useState<string>(initialProfile?.ability ?? "");
  const [item, setItem] = useState<string>(initialProfile?.item ?? "");
  const [evs, setEvs] = useState<StatSpread>(initialProfile?.evs ?? emptySpread(0));
  const [ivs, setIvs] = useState<StatSpread>(initialProfile?.ivs ?? emptySpread(31));
  const [moveset, setMoveset] = useState<string[]>(
    initialProfile ? [...initialProfile.moveset, "", "", "", ""].slice(0, 4) : ["", "", "", ""],
  );
  const [error, setError] = useState<string>("");
  const [tmhmMoveSlugs, setTmhmMoveSlugs] = useState<string[]>([]);
  const [tutorMoveSlugs, setTutorMoveSlugs] = useState<string[]>([]);
  const [movesLoading, setMovesLoading] = useState(false);

  const details = dataset.pokemon[currentSpecies] ?? null;

  useEffect(() => {
    let active = true;
    setMovesLoading(true);
    void fetchPokemonMoveBuckets(currentSpecies)
      .then((buckets) => {
        if (!active) return;
        setTmhmMoveSlugs(Array.isArray(buckets.tmhm) ? buckets.tmhm : []);
        setTutorMoveSlugs(Array.isArray(buckets.tutor) ? buckets.tutor : []);
      })
      .catch(() => {
        if (!active) return;
        setTmhmMoveSlugs([]);
        setTutorMoveSlugs([]);
      })
      .finally(() => {
        if (active) setMovesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [currentSpecies]);

  const moveKeyBySlug = useMemo(() => {
    const map = new Map<string, string>();
    for (const [key, info] of Object.entries(dataset.moves)) {
      map.set(toSlug(info.name), key);
      map.set(toSlug(getDisplayToken(key)), key);
    }
    return map;
  }, [dataset]);

  const tmhmMoveKeys = useMemo(
    () => tmhmMoveSlugs.map((slug) => moveKeyBySlug.get(slug)).filter((key): key is string => Boolean(key)),
    [tmhmMoveSlugs, moveKeyBySlug],
  );
  const tutorMoveKeys = useMemo(
    () => tutorMoveSlugs.map((slug) => moveKeyBySlug.get(slug)).filter((key): key is string => Boolean(key)),
    [tutorMoveSlugs, moveKeyBySlug],
  );

  const abilityOptions = useMemo(() => {
    if (!details) return [] as Array<{ key: string; label: string }>;
    return details.abilities.map((key) => ({ key, label: dataset.abilities[key]?.name ?? getDisplayToken(key) }));
  }, [details, dataset]);

  const itemOptions = useMemo(
    () =>
      Object.values(dataset.items)
        .map((info) => ({ key: info.key, label: info.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [dataset],
  );

  const moveKeys = useMemo(() => {
    if (!details) return [] as string[];
    return [...new Set([...details.levelUpMoves.map((learn) => learn.move), ...details.eggMoves, ...tmhmMoveKeys, ...tutorMoveKeys])];
  }, [details, tmhmMoveKeys, tutorMoveKeys]);

  const moveOptions = useMemo(
    () =>
      moveKeys
        .map((key) => ({ key, label: dataset.moves[key]?.name ?? getDisplayToken(key) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [moveKeys, dataset],
  );

  const calculatedStats = useMemo(() => {
    if (!details) return null;
    const natureInfo = NATURE_BY_NAME.get(nature);
    const modifiers = getNatureModifiers(natureInfo?.up ?? null, natureInfo?.down ?? null);
    return calculateCaughtPokemonStats(details.stats, level, ivs, evs, modifiers);
  }, [details, level, nature, ivs, evs]);

  useEffect(() => {
    if (!details) return;
    const valid = ability && details.abilities.includes(ability);
    if (!valid) {
      setAbility(details.abilities[0] ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [details]);

  const updateSpreadValue = (
    setter: (updater: (current: StatSpread) => StatSpread) => void,
    key: keyof StatSpread,
    rawValue: string,
    max: number,
  ) => {
    const value = Number.parseInt(rawValue, 10);
    setter((current) => ({
      ...current,
      [key]: Number.isNaN(value) ? 0 : Math.max(0, Math.min(max, value)),
    }));
  };

  const updateMovesetSlot = (index: number, moveKey: string) => {
    setMoveset((current) => {
      const next = [...current];
      next[index] = moveKey;
      return next;
    });
  };

  const handleSave = () => {
    const trimmedMoves = moveset.filter(Boolean);
    if (level < 1 || level > 100) {
      setError("Level must be between 1 and 100.");
      return;
    }
    if (trimmedMoves.length === 0) {
      setError("Choose at least one move.");
      return;
    }
    const uniqueMoves = new Set(trimmedMoves);
    if (uniqueMoves.size !== trimmedMoves.length) {
      setError("Moveset cannot contain duplicate moves.");
      return;
    }
    const learnable = new Set(moveKeys);
    if (trimmedMoves.some((move) => !learnable.has(move))) {
      setError("Selected move is not learnable by this Pokémon.");
      return;
    }
    if (sumSpread(evs) > 510) {
      setError("Total EVs cannot exceed 510.");
      return;
    }
    const abilityAllowed = !ability || abilityOptions.some((a) => a.key === ability);
    if (!abilityAllowed) {
      setError("Selected ability is not available for this Pokémon.");
      return;
    }

    const profile: CaughtPokemonProfile = {
      id: initialProfile?.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      originalSpecies: initialProfile?.originalSpecies ?? originalSpecies,
      currentSpecies,
      level: Math.max(1, Math.min(100, level)),
      nature,
      ability,
      item,
      evs: { ...evs },
      ivs: { ...ivs },
      moveset: trimmedMoves,
      updatedAt: new Date().toISOString(),
    };
    onSave(profile);
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="modal-card">
        <h3>Configure Owned Pokémon</h3>
        <p className="muted">Set the current state of this owned Pokémon. You can update this later.</p>

        <div className="caught-fields-grid">
          <label className="build-field">
            Current Pokemon
            <input
              type="text"
              value={entries.find((entry) => entry.id === currentSpecies)?.displayName
                ?? getDisplayToken(currentSpecies.replace("SPECIES_", ""))}
              disabled
            />
          </label>

          <label className="build-field">
            Level
            <input
              type="number"
              min={1}
              max={100}
              value={level}
              onFocus={(event) => event.target.select()}
              onChange={(event) => {
                const value = Number.parseInt(event.target.value, 10);
                setLevel(Number.isNaN(value) ? 1 : Math.max(1, Math.min(100, value)));
              }}
            />
          </label>

          <label className="build-field">
            Nature
            <select value={nature} onChange={(event) => setNature(event.target.value)}>
              {NATURES.map((option) => (
                <option key={option.name} value={option.name}>{formatNatureLabel(option.name)}</option>
              ))}
            </select>
          </label>

          <label className="build-field">
            Ability
            <select value={ability} onChange={(event) => setAbility(event.target.value)}>
              <option value="">(none)</option>
              {abilityOptions.map((option) => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="build-field">
            Item
            <select value={item} onChange={(event) => setItem(event.target.value)}>
              <option value="">(none)</option>
              {itemOptions.map((option) => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="build-spreads">
          <div>
            <h4>EVs</h4>
            <div className="build-spread-grid">
              {BUILD_STATS.map((stat) => (
                <label key={`ev-${stat.key}`} className="build-field">
                  {stat.label}
                  <input
                    type="number"
                    min={0}
                    max={252}
                    value={evs[stat.key]}
                    onChange={(event) => updateSpreadValue(setEvs, stat.key, event.target.value, 252)}
                  />
                </label>
              ))}
            </div>
            <p className={sumSpread(evs) > 510 ? "error-text" : "muted"}>
              Total EVs: {sumSpread(evs)}/510
            </p>
          </div>

          <div>
            <h4>IVs</h4>
            <div className="build-spread-grid">
              {BUILD_STATS.map((stat) => (
                <label key={`iv-${stat.key}`} className="build-field">
                  {stat.label}
                  <input
                    type="number"
                    min={0}
                    max={31}
                    value={ivs[stat.key]}
                    onChange={(event) => updateSpreadValue(setIvs, stat.key, event.target.value, 31)}
                  />
                </label>
              ))}
            </div>
          </div>
        </div>

        {calculatedStats ? (
          <div>
            <h4>Calculated Stats</h4>
            <div className="stats-grid">
              {[
                ["HP", calculatedStats.hp],
                ["Atk", calculatedStats.attack],
                ["Def", calculatedStats.defense],
                ["SpA", calculatedStats.spAttack],
                ["SpD", calculatedStats.spDefense],
                ["Spe", calculatedStats.speed],
                ["Total", calculatedStats.total],
              ].map(([label, value]) => (
                <div key={label} className="stat-row">
                  <span className="stat-label">{label}</span>
                  <span className="stat-bar-wrap">
                    <span
                      className="stat-bar"
                      style={{ width: `${Math.min(100, Math.round((Number(value) / 255) * 100))}%` }}
                    />
                  </span>
                  <span className="stat-value">{value}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div>
          <h4>Moveset</h4>
          {movesLoading ? <p className="muted">Loading TM/HM and tutor moves…</p> : null}
          <div className="build-moves-grid">
            {moveset.map((moveKey, slotIndex) => (
              <label key={`move-slot-${slotIndex}`} className="build-field">
                Move {slotIndex + 1}
                <select value={moveKey} onChange={(event) => updateMovesetSlot(slotIndex, event.target.value)}>
                  <option value="">(empty)</option>
                  {moveOptions.map((option) => {
                    const inOtherSlot = moveset.includes(option.key) && moveset[slotIndex] !== option.key;
                    return (
                      <option key={option.key} value={option.key} disabled={inOtherSlot}>
                        {option.label}
                      </option>
                    );
                  })}
                </select>
              </label>
            ))}
          </div>
        </div>

        {error ? <p className="error-text">{error}</p> : null}

        <div className="modal-actions">
          <button type="button" className="btn-primary" onClick={handleSave}>Save</button>
          <button type="button" className="status-pill" onClick={onClose}>Cancel</button>
        </div>
      </section>
    </div>
  );
}
