import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useParams } from "react-router-dom";
import { fetchImageObjectUrlWithPersistentCache } from "./httpCache";
import { fetchUnboundPokedex } from "./pokedex";
import {
  fetchAbilityDescription,
  fetchMoveDescription,
  fetchPokemonMoveBuckets,
  fetchPokemonSpriteUrl,
} from "./pokeApi";
import {
  loadBuildMap,
  loadCaughtPokemonMap,
  loadCaughtSpeciesMap,
  saveBuildMap,
  saveCaughtPokemonMap,
  saveCaughtSpeciesMap,
} from "./storage";
import { getDisplayToken, getUnboundDataset } from "./unboundData";
import { useCloudSync } from "./useCloudSync";
import { getTypeColor, getTypeTextColor } from "./typeColors";
import { calculateCaughtPokemonStats, getNatureModifiers } from "./statCalculator";
import {
  BUILD_STATS,
  NATURES,
  NATURE_BY_NAME,
  emptySpread,
  findAncestorPath,
  formatNatureLabel,
  sumSpread,
  toSlug,
} from "./pokemonBuild";
import { CaughtProfileModal } from "./CaughtProfileModal";
import type {
  AbilityInfo,
  BuildMap,
  CaughtPokemonMap,
  CaughtPokemonProfile,
  CaughtSpeciesMap,
  EvoTreeNode,
  ItemInfo,
  MoveInfo,
  PokemonBuild,
  PokemonEntry,
  PokemonStats,
  StatSpread,
  UnboundDataset,
} from "./types";

// ---- Hover popover ----
type PopoverContent =
  | { kind: "move"; info: MoveInfo }
  | { kind: "ability"; info: AbilityInfo }
  | { kind: "item"; info: ItemInfo };

function PopoverCard({ content, liveDesc }: { content: PopoverContent; liveDesc: string }) {
  if (content.kind === "move") {
    const { info } = content;
    return (
      <>
        <div className="popover-title">
          <strong>{info.name}</strong>
          {info.type ? (
            <span
              className="type-chip type-chip-sm"
              style={{ background: getTypeColor(info.type), color: getTypeTextColor(info.type) }}
            >
              {getDisplayToken(info.type)}
            </span>
          ) : null}
          {info.split ? <SplitIcon split={info.split} /> : null}
        </div>
        <div className="popover-stats">
          <span>Pwr {info.power || "—"}</span>
          <span>Acc {info.accuracy || "—"}</span>
          <span>PP {info.pp}</span>
        </div>
        {liveDesc ? (
          <p className="popover-desc">{liveDesc}</p>
        ) : (
          <p className="popover-desc popover-loading">Loading…</p>
        )}
      </>
    );
  }
  if (content.kind === "ability") {
    return (
      <>
        <div className="popover-title"><strong>{content.info.name}</strong></div>
        {liveDesc ? (
          <p className="popover-desc">{liveDesc}</p>
        ) : (
          <p className="popover-desc popover-loading">Loading…</p>
        )}
      </>
    );
  }
  return (
    <>
      <div className="popover-title"><strong>{content.info.name}</strong></div>
      {liveDesc ? <p className="popover-desc">{liveDesc}</p> : null}
    </>
  );
}

function usePopover() {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [content, setContent] = useState<PopoverContent | null>(null);
  const [liveDesc, setLiveDesc] = useState<string>("");
  const [pinned, setPinned] = useState(false);
  const activeKeyRef = useRef<string | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchAbort = useRef<{ cancelled: boolean }>({ cancelled: false });

  const contentKey = (c: PopoverContent) => `${c.kind}-${c.info.key}`;

  const show = (e: React.MouseEvent, c: PopoverContent) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setPos({ x: e.clientX, y: e.clientY });
    setContent(c);
    setLiveDesc(c.info.description);

    // If description is missing, fetch from PokéAPI
    if (!c.info.description) {
      const token = { cancelled: false };
      fetchAbort.current = token;

      const doFetch =
        c.kind === "move"
          ? fetchMoveDescription(c.info.key, c.info.name)
          : c.kind === "ability"
            ? fetchAbilityDescription(c.info.key, c.info.name)
            : Promise.resolve("");

      doFetch.then((desc) => {
        if (!token.cancelled) {
          const finalDesc = desc || "No description available.";
          // Cache back onto the info object so future hovers are instant
          c.info.description = finalDesc;
          setLiveDesc(finalDesc);
        }
      });
    }
  };

  const move = (e: React.MouseEvent) => {
    setPos({ x: e.clientX, y: e.clientY });
  };

  const closeNow = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    fetchAbort.current.cancelled = true;
    setPos(null);
    setContent(null);
    setLiveDesc("");
    setPinned(false);
    activeKeyRef.current = null;
  };

  const hide = () => {
    fetchAbort.current.cancelled = true;
    hideTimer.current = setTimeout(() => {
      setPos(null);
      setContent(null);
      setLiveDesc("");
      setPinned(false);
      activeKeyRef.current = null;
    }, 80);
  };

  // Tap/click support for touch devices (no hover): tapping opens the popover and
  // keeps it open until the same item is tapped again or the user taps elsewhere.
  const toggle = (e: React.MouseEvent, c: PopoverContent) => {
    e.stopPropagation();
    const key = contentKey(c);
    if (pinned && activeKeyRef.current === key) {
      closeNow();
      return;
    }
    activeKeyRef.current = key;
    setPinned(true);
    show(e, c);
  };

  useEffect(() => {
    if (!pinned) return;
    const onDocPointerDown = (event: Event) => {
      const target = event.target as HTMLElement;
      if (target.closest(".popover") || target.closest("[data-popover-trigger]")) return;
      closeNow();
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [pinned]);

  const popoverEl =
    pos && content
      ? createPortal(
          <div
            className="popover"
            style={{
              left: pos.x + 14,
              top: pos.y + 14,
            }}
          >
            <PopoverCard content={content} liveDesc={liveDesc} />
          </div>,
          document.body,
        )
      : null;

  return { show, move, hide, toggle, popoverEl };
}

// --- Move split icon (inline SVG paths approximating Physical/Special/Status) ---
function SplitIcon({ split }: { split: string }) {
  if (split === "SPLIT_PHYSICAL") {
    return (
      <svg width="20" height="14" viewBox="0 0 20 14" aria-label="Physical">
        <polygon points="10,1 19,13 1,13" fill="#c03028" />
      </svg>
    );
  }
  if (split === "SPLIT_SPECIAL") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-label="Special">
        <circle cx="8" cy="8" r="7" fill="#6890f0" />
      </svg>
    );
  }
  // Status
  return (
    <svg width="20" height="10" viewBox="0 0 20 10" aria-label="Status">
      <rect x="0" y="2" width="20" height="6" rx="3" fill="#a8a878" />
    </svg>
  );
}

type MovesTableEntry = { learn: { move: string; level: number }; info: MoveInfo | undefined };

type MovesTableFirstColumn = {
  header: string;
  render: (entry: MovesTableEntry) => React.ReactNode;
} | null;

function MovesTable({
  moves,
  dataset: _dataset,
  onShow,
  onMove,
  onHide,
  onTap,
  firstColumn,
}: {
  moves: MovesTableEntry[];
  dataset: UnboundDataset | null;
  onShow: (e: React.MouseEvent, key: string) => void;
  onMove: (e: React.MouseEvent) => void;
  onHide: () => void;
  onTap?: (e: React.MouseEvent, key: string) => void;
  firstColumn?: MovesTableFirstColumn;
}) {
  const showFirstColumn = firstColumn !== null;
  return (
    <div className="moves-table-wrap">
      <table className="moves-table">
        <thead>
          <tr>
            {showFirstColumn ? <th>{firstColumn?.header ?? "Lv"}</th> : null}
            <th>Name</th>
            <th>Type</th>
            <th>Cat</th>
            <th>Power</th>
            <th>Acc</th>
            <th>PP</th>
          </tr>
        </thead>
        <tbody>
          {moves.map((entry) => {
            const { learn, info } = entry;
            return (
              <tr
                key={`${learn.move}-${learn.level}`}
                className="move-row"
                data-popover-trigger="true"
                onMouseEnter={(e) => onShow(e, learn.move)}
                onMouseMove={onMove}
                onMouseLeave={onHide}
                onClick={(e) => onTap?.(e, learn.move)}
              >
                {showFirstColumn ? (
                  <td className="move-level">
                    {firstColumn ? firstColumn.render(entry) : (learn.level < 0 ? "—" : learn.level)}
                  </td>
                ) : null}
                <td className="move-name">{info?.name ?? getDisplayToken(learn.move)}</td>
                <td>
                  {info?.type ? (
                    <span
                      className="type-chip type-chip-sm"
                      style={{ background: getTypeColor(info.type), color: getTypeTextColor(info.type) }}
                    >
                      {getDisplayToken(info.type)}
                    </span>
                  ) : "—"}
                </td>
                <td className="move-split">
                  {info?.split ? <SplitIcon split={info.split} /> : "—"}
                </td>
                <td>{info?.power === 0 ? "—" : (info?.power ?? "—")}</td>
                <td>{info?.accuracy === 0 ? "—" : (info?.accuracy ?? "—")}</td>
                <td>{info?.pp ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

async function resolveSpriteObjectUrl(speciesKey: string, fallbackUrl: string): Promise<string> {
  const pokeApiUrl = await fetchPokemonSpriteUrl(speciesKey);
  const primaryUrl = pokeApiUrl || fallbackUrl;
  if (primaryUrl) {
    try {
      return await fetchImageObjectUrlWithPersistentCache(primaryUrl);
    } catch {
      // Fallback below.
    }
  }
  if (fallbackUrl && fallbackUrl !== primaryUrl) {
    return fetchImageObjectUrlWithPersistentCache(fallbackUrl);
  }
  return "";
}

// ---- Sprite image with async fetch ----
export function SpriteImage({
  speciesKey,
  fallbackUrl,
  alt,
  className = "evo-sprite",
}: {
  speciesKey: string;
  fallbackUrl: string;
  alt: string;
  className?: string;
}) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    resolveSpriteObjectUrl(speciesKey, fallbackUrl)
      .then((u) => { if (active) { objectUrl = u; setSrc(u); } })
      .catch(() => {});
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [speciesKey, fallbackUrl]);

  return src
    ? <img src={src} alt={alt} className={className} loading="lazy" />
    : <div className={className} />;
}

// Evo methods that represent alternate battle forms rather than a true species evolution.
const FORM_EVO_METHODS = new Set(["EVO_MEGA", "EVO_GIGANTAMAX", "EVO_PRIMAL", "EVO_ULTRA_BURST"]);

// ---- Evolution tree renderer ----
function EvoTree({
  node,
  selectedSpecies,
  dataset,
  onSelect,
}: {
  node: EvoTreeNode;
  selectedSpecies: string | null;
  dataset: UnboundDataset | null;
  onSelect: (species: string) => void;
}) {
  const isSelf = node.species === selectedSpecies;
  const spriteUrl = dataset?.pokemon[node.species]?.spriteUrl ?? "";
  const types = dataset?.pokemon[node.species]?.types ?? [];
  const displayName = getDisplayToken(node.species.replace("SPECIES_", ""));
  const methodLabel = node.method === "EVO_LEVEL"
    ? `Lv. ${node.condition}`
    : node.method
      ? getDisplayToken(node.method) + (node.condition && node.condition !== "0" && node.condition !== "TRUE" && node.condition !== "FALSE"
          ? ` (${getDisplayToken(node.condition)})` : "")
      : "";

  return (
    <div className="evo-tree-node">
      {/* Arrow + method label (for non-root nodes) */}
      {node.method && (
        <div className="evo-arrow-col">
          <span className="evo-arrow-icon">→</span>
          {methodLabel && <span className="evo-method-label">{methodLabel}</span>}
        </div>
      )}

      <div className="evo-tree-branch">
        {/* This Pokémon card */}
        <button
          type="button"
          className={`evo-card ${isSelf ? "evo-card-current" : ""}`}
          onClick={() => !isSelf && onSelect(node.species)}
          disabled={isSelf}
        >
          <SpriteImage speciesKey={node.species} fallbackUrl={spriteUrl} alt={displayName} />
          <div className="evo-card-types">
            {types.map((t) => (
              <span key={t} className="type-chip type-chip-sm" style={{ background: getTypeColor(t), color: getTypeTextColor(t) }}>
                {getDisplayToken(t)}
              </span>
            ))}
          </div>
          <span className="evo-card-name">{displayName}</span>
        </button>

        {/* Only regular (non-form) evolutions continue the chain here; alternate forms are collected separately. */}
        {(() => {
          const regularChildren = node.children.filter((child) => !FORM_EVO_METHODS.has(child.method));
          return regularChildren.length > 0 ? (
            <div className="evo-tree-row">
              {regularChildren.map((child, i) => (
                <EvoTree key={`${child.species}-${i}`} node={child} selectedSpecies={selectedSpecies} dataset={dataset} onSelect={onSelect} />
              ))}
            </div>
          ) : null;
        })()}
      </div>
    </div>
  );
}

/** Collects every alternate-form node (Mega/Gigantamax/Primal/Ultra Burst) anywhere in the tree. */
function collectFormNodes(root: EvoTreeNode): EvoTreeNode[] {
  const forms: EvoTreeNode[] = [];
  const walk = (node: EvoTreeNode) => {
    for (const child of node.children) {
      if (FORM_EVO_METHODS.has(child.method)) {
        forms.push(child);
      } else {
        walk(child);
      }
    }
  };
  walk(root);
  return forms;
}

// Number of Pokémon cards rendered per page; more load in as the user scrolls near the bottom.
const GRID_PAGE_SIZE = 48;

function App() {
  const [entries, setEntries] = useState<PokemonEntry[]>([]);
  const [dataset, setDataset] = useState<UnboundDataset | null>(null);
  const [caughtPokemonMap, setCaughtPokemonMap] = useState<CaughtPokemonMap>(() =>
    loadCaughtPokemonMap(),
  );
  const [buildMap, setBuildMap] = useState<BuildMap>(() =>
    loadBuildMap(),
  );
  const [caughtSpeciesMap, setCaughtSpeciesMap] = useState<CaughtSpeciesMap>(() =>
    loadCaughtSpeciesMap(),
  );
  const params = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const selectedSpecies = params.id ?? null;
  const goToSpecies = (id: string) => navigate(`/pokemon/${id}`);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const toggleSection = (id: string) => {
    setCollapsedSections((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };
  const [search, setSearch] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [caughtOnly, setCaughtOnly] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [minBaseStat, setMinBaseStat] = useState<number>(0);
  const [maxBaseStat, setMaxBaseStat] = useState<number>(800);
  const [statFilters, setStatFilters] = useState<Record<keyof StatSpread, { min: number; max: number }>>({
    hp: { min: 0, max: 255 },
    attack: { min: 0, max: 255 },
    defense: { min: 0, max: 255 },
    spAttack: { min: 0, max: 255 },
    spDefense: { min: 0, max: 255 },
    speed: { min: 0, max: 255 },
  });
  const [selectedImageSrc, setSelectedImageSrc] = useState<string>("");
  const [baseStatsPreviewNature, setBaseStatsPreviewNature] = useState<string>(NATURES[0].name);
  const [buildName, setBuildName] = useState<string>("");
  const [buildNature, setBuildNature] = useState<string>(NATURES[0].name);
  const [buildAbility, setBuildAbility] = useState<string>("");
  const [buildItem, setBuildItem] = useState<string>("");
  const [buildEvs, setBuildEvs] = useState<StatSpread>(() => emptySpread(0));
  const [buildIvs, setBuildIvs] = useState<StatSpread>(() => emptySpread(31));
  const [buildMoveset, setBuildMoveset] = useState<string[]>(["", "", "", ""]);
  const [buildError, setBuildError] = useState<string>("");
  // Modal for creating/editing an "owned" Pokémon profile (level/nature/EVs/moveset etc.).
  // Creation is triggered from Pokedex Boxes; editing is triggered from the species detail page.
  const [profileModalSpecies, setProfileModalSpecies] = useState<string | null>(null);
  const [profileModalEditing, setProfileModalEditing] = useState<CaughtPokemonProfile | null>(null);
  const [tmhmMoveSlugs, setTmhmMoveSlugs] = useState<string[]>([]);
  const [tmhmNumbersBySlug, setTmhmNumbersBySlug] = useState<Record<string, string>>({});
  const [tutorMoveSlugs, setTutorMoveSlugs] = useState<string[]>([]);
  const [movesetLoading, setMovesetLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { show: popShow, move: popMove, hide: popHide, toggle: popToggle, popoverEl } = usePopover();
  const cloudSync = useCloudSync({
    caughtPokemonMap,
    buildMap,
    setCaughtPokemonMap,
    setBuildMap,
    caughtSpeciesMap,
    setCaughtSpeciesMap,
  });
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [accountEmail, setAccountEmail] = useState("");

  useEffect(() => {
    const run = async () => {
      try {
        const pokedexEntries = await fetchUnboundPokedex();
        setEntries(pokedexEntries);
      } catch (fetchError) {
        if (fetchError instanceof Error) {
          setError(fetchError.message);
        } else {
          setError("Unable to load Pokemon data.");
        }
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
        if (datasetError instanceof Error) {
          setError(datasetError.message);
        } else {
          setError("Unable to build the Unbound dataset.");
        }
      } finally {
        setIsLoading(false);
      }
    };

    void run();
  }, [entries]);

  useEffect(() => {
    saveCaughtPokemonMap(caughtPokemonMap);
  }, [caughtPokemonMap]);

  useEffect(() => {
    saveBuildMap(buildMap);
  }, [buildMap]);

  useEffect(() => {
    saveCaughtSpeciesMap(caughtSpeciesMap);
  }, [caughtSpeciesMap]);

  useEffect(() => {
    if (!selectedSpecies || !dataset) {
      setSelectedImageSrc("");
      return;
    }

    const details = dataset.pokemon[selectedSpecies];
    if (!details) {
      setSelectedImageSrc("");
      return;
    }

    let active = true;
    let objectUrl = "";
    const run = async () => {
      try {
        objectUrl = await resolveSpriteObjectUrl(selectedSpecies, details.spriteUrl);
        if (active) {
          setSelectedImageSrc(objectUrl);
        }
      } catch (imageError) {
        console.warn("Unable to load cached sprite image.", imageError);
      }
    };

    void run();
    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [selectedSpecies, dataset]);

  useEffect(() => {
    if (!selectedSpecies) {
      setTmhmMoveSlugs([]);
      setTutorMoveSlugs([]);
      setTmhmNumbersBySlug({});
      return;
    }
    let active = true;
    setMovesetLoading(true);
    void fetchPokemonMoveBuckets(selectedSpecies)
      .then((buckets) => {
        if (!active) return;
        setTmhmMoveSlugs(Array.isArray(buckets.tmhm) ? buckets.tmhm : []);
        setTutorMoveSlugs(Array.isArray(buckets.tutor) ? buckets.tutor : []);
        setTmhmNumbersBySlug(buckets.tmhmNumbers ?? {});
      })
      .catch(() => {
        if (!active) return;
        setTmhmMoveSlugs([]);
        setTutorMoveSlugs([]);
        setTmhmNumbersBySlug({});
      })
      .finally(() => {
        if (active) setMovesetLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedSpecies]);

  useEffect(() => {
    setBaseStatsPreviewNature(NATURES[0].name);
    setCollapsedSections(new Set());
  }, [selectedSpecies]);

  const caughtCountBySpecies = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.entries(caughtPokemonMap).forEach(([speciesKey, profiles]) => {
      counts[speciesKey] = profiles.length;
    });
    return counts;
  }, [caughtPokemonMap]);

  // Species marked as caught only because they're an earlier evolution stage of a
  // registered catch (e.g. Bulbasaur/Ivysaur when a Venasaur was caught starting as Bulbasaur).
  // These get the greenish "caught" styling but never their own count badge.
  const ancestorCaughtSpecies = useMemo(() => {
    const marked = new Set<string>();
    if (!dataset) return marked;
    Object.values(caughtPokemonMap).flat().forEach((profile) => {
      const startingSpecies = profile.startingSpecies || profile.currentSpecies;
      if (startingSpecies === profile.currentSpecies) return;
      const details = dataset.pokemon[profile.currentSpecies];
      const path = findAncestorPath(details?.evolutions ?? null, profile.currentSpecies);
      const startIdx = path.indexOf(startingSpecies);
      if (startIdx === -1) return;
      for (let i = startIdx; i < path.length - 1; i += 1) {
        marked.add(path[i]);
      }
    });
    return marked;
  }, [caughtPokemonMap, dataset]);

  // Maps an ancestor-only species to the final (currentSpecies) forms that were registered as having evolved from it.
  const ancestorCaughtSources = useMemo(() => {
    const sources = new Map<string, Set<string>>();
    if (!dataset) return sources;
    Object.values(caughtPokemonMap).flat().forEach((profile) => {
      const startingSpecies = profile.startingSpecies || profile.currentSpecies;
      if (startingSpecies === profile.currentSpecies) return;
      const details = dataset.pokemon[profile.currentSpecies];
      const path = findAncestorPath(details?.evolutions ?? null, profile.currentSpecies);
      const startIdx = path.indexOf(startingSpecies);
      if (startIdx === -1) return;
      for (let i = startIdx; i < path.length - 1; i += 1) {
        if (!sources.has(path[i])) sources.set(path[i], new Set());
        sources.get(path[i])!.add(profile.currentSpecies);
      }
    });
    return sources;
  }, [caughtPokemonMap, dataset]);

  const isSpeciesRegistered = (speciesId: string) =>
    Boolean(caughtSpeciesMap[speciesId]) ||
    (caughtCountBySpecies[speciesId] ?? 0) > 0 ||
    ancestorCaughtSpecies.has(speciesId);

  const toggleCaughtSpecies = (speciesId: string) => {
    setCaughtSpeciesMap((current) => {
      const next = { ...current };
      if (next[speciesId]) {
        delete next[speciesId];
      } else {
        next[speciesId] = true;
      }
      return next;
    });
  };

  const availableTypeFilters = useMemo(() => {
    if (!dataset) {
      return [] as string[];
    }
    const allTypes = new Set<string>();
    entries.forEach((entry) => {
      (dataset.pokemon[entry.id]?.types ?? []).forEach((type) => allTypes.add(type));
    });
    return [...allTypes].sort((a, b) => getDisplayToken(a).localeCompare(getDisplayToken(b)));
  }, [dataset, entries]);

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    return entries.filter((entry) => {
      const matchesName =
        query.length === 0 ||
        entry.displayName.toLowerCase().includes(query);

      const matchesCaught = !caughtOnly || isSpeciesRegistered(entry.id);
      
      const pokemonTypes = dataset?.pokemon[entry.id]?.types ?? [];
      const matchesType =
        selectedTypes.size === 0 ||
        Array.from(selectedTypes).every((type) => pokemonTypes.includes(type));

      const pokemonStats = dataset?.pokemon[entry.id]?.stats;
      const baseStat = pokemonStats?.total ?? 0;
      const matchesBaseStat = baseStat >= minBaseStat && baseStat <= maxBaseStat;

      const matchesIndividualStats =
        pokemonStats &&
        pokemonStats.hp >= statFilters.hp.min && pokemonStats.hp <= statFilters.hp.max &&
        pokemonStats.attack >= statFilters.attack.min && pokemonStats.attack <= statFilters.attack.max &&
        pokemonStats.defense >= statFilters.defense.min && pokemonStats.defense <= statFilters.defense.max &&
        pokemonStats.spAttack >= statFilters.spAttack.min && pokemonStats.spAttack <= statFilters.spAttack.max &&
        pokemonStats.spDefense >= statFilters.spDefense.min && pokemonStats.spDefense <= statFilters.spDefense.max &&
        pokemonStats.speed >= statFilters.speed.min && pokemonStats.speed <= statFilters.speed.max;

      return matchesName && matchesCaught && matchesType && matchesBaseStat && matchesIndividualStats;
    });
  }, [entries, search, caughtOnly, caughtCountBySpecies, ancestorCaughtSpecies, selectedTypes, dataset, minBaseStat, maxBaseStat, statFilters]);

  const [visibleCount, setVisibleCount] = useState(GRID_PAGE_SIZE);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Reset pagination whenever the filtered results change (e.g. new search/filter).
  useEffect(() => {
    setVisibleCount(GRID_PAGE_SIZE);
  }, [filteredEntries]);

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel) {
      return;
    }
    const observer = new IntersectionObserver(
      (observerEntries) => {
        if (observerEntries.some((observerEntry) => observerEntry.isIntersecting)) {
          setVisibleCount((current) => Math.min(current + GRID_PAGE_SIZE, filteredEntries.length));
        }
      },
      { rootMargin: "400px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMoreRef, filteredEntries.length]);

  const visibleEntries = useMemo(
    () => filteredEntries.slice(0, visibleCount),
    [filteredEntries, visibleCount],
  );

  const caughtCount = useMemo(
    () => entries.filter((entry) => isSpeciesRegistered(entry.id)).length,
    [entries, caughtCountBySpecies, ancestorCaughtSpecies],
  );

  const totalCount = entries.length;
  const progressPercentage =
    totalCount === 0 ? 0 : Math.round((caughtCount / totalCount) * 100);

  const openProfileModalForEdit = (profile: CaughtPokemonProfile) => {
    setProfileModalSpecies(profile.originalSpecies);
    setProfileModalEditing(profile);
  };

  const closeProfileModal = () => {
    setProfileModalSpecies(null);
    setProfileModalEditing(null);
  };

  const saveProfile = (profile: CaughtPokemonProfile) => {
    setCaughtPokemonMap((current) => {
      const next: CaughtPokemonMap = {};

      for (const [speciesKey, profiles] of Object.entries(current)) {
        const filtered = profiles.filter((entry) => entry.id !== profile.id);
        if (filtered.length > 0) {
          next[speciesKey] = filtered;
        }
      }

      const targetSpecies = profile.currentSpecies;
      next[targetSpecies] = [...(next[targetSpecies] ?? []), profile];
      return next;
    });
    closeProfileModal();
  };

  const selectedDetails = useMemo(() => {
    if (!selectedSpecies || !dataset) {
      return null;
    }
    return dataset.pokemon[selectedSpecies] ?? null;
  }, [selectedSpecies, dataset]);

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.id === selectedSpecies) ?? null,
    [entries, selectedSpecies],
  );

  const moveKeyBySlug = useMemo(() => {
    const map = new Map<string, string>();
    if (!dataset) return map;
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

  const tmhmNumberByMoveKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const slug of tmhmMoveSlugs) {
      const key = moveKeyBySlug.get(slug);
      const number = tmhmNumbersBySlug[slug];
      if (key && number) map.set(key, number);
    }
    return map;
  }, [tmhmMoveSlugs, moveKeyBySlug, tmhmNumbersBySlug]);

  const sortedTmhmMoveKeys = useMemo(() => {
    const rank = (key: string) => {
      const label = tmhmNumberByMoveKey.get(key);
      const match = label?.match(/^(HM|TM|TR)(\d+)/i);
      if (!match) return { group: 3, num: Number.MAX_SAFE_INTEGER };
      const groupOrder: Record<string, number> = { HM: 0, TM: 1, TR: 2 };
      return { group: groupOrder[match[1].toUpperCase()] ?? 3, num: Number(match[2]) };
    };
    return [...tmhmMoveKeys].sort((a, b) => {
      const rankA = rank(a);
      const rankB = rank(b);
      if (rankA.group !== rankB.group) return rankA.group - rankB.group;
      return rankA.num - rankB.num;
    });
  }, [tmhmMoveKeys, tmhmNumberByMoveKey]);

  const tutorMoveKeys = useMemo(
    () => tutorMoveSlugs.map((slug) => moveKeyBySlug.get(slug)).filter((key): key is string => Boolean(key)),
    [tutorMoveSlugs, moveKeyBySlug],
  );

  const learnableMoveKeys = useMemo(() => {
    if (!selectedDetails) {
      return [] as string[];
    }
    const moveSet = new Set<string>([
      ...selectedDetails.levelUpMoves.map((learn) => learn.move),
      ...selectedDetails.eggMoves,
      ...tmhmMoveKeys,
      ...tutorMoveKeys,
    ]);
    return [...moveSet];
  }, [selectedDetails, tmhmMoveKeys, tutorMoveKeys]);

  const learnableMoveOptions = useMemo(() => {
    if (!dataset) {
      return [] as Array<{ key: string; label: string }>;
    }
    return learnableMoveKeys
      .map((key) => ({
        key,
        label: dataset.moves[key]?.name ?? getDisplayToken(key),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [learnableMoveKeys, dataset]);

  const buildAbilityOptions = useMemo(() => {
    if (!selectedDetails || !dataset) {
      return [] as Array<{ key: string; label: string }>;
    }
    return selectedDetails.abilities.map((key) => ({
      key,
      label: dataset.abilities[key]?.name ?? getDisplayToken(key),
    }));
  }, [selectedDetails, dataset]);

  const buildItemOptions = useMemo(() => {
    if (!dataset) {
      return [] as Array<{ key: string; label: string }>;
    }
    return Object.values(dataset.items)
      .map((item) => ({ key: item.key, label: item.name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [dataset]);

  const selectedBuilds = selectedSpecies ? (buildMap[selectedSpecies] ?? []) : [];
  const selectedCaughtProfiles = selectedSpecies ? (caughtPokemonMap[selectedSpecies] ?? []) : [];

  // Pre-fetch move/ability descriptions for the selected Pokémon so hover popovers are instant.
  useEffect(() => {
    if (!selectedDetails || !dataset) return;
    const allMoveKeys = [
      ...selectedDetails.levelUpMoves.map((m) => m.move),
      ...(selectedDetails.eggMoves ?? []),
      ...tmhmMoveKeys,
      ...tutorMoveKeys,
    ];
    for (const key of allMoveKeys) {
      const info = dataset.moves[key];
      if (info && !info.description) {
        void fetchMoveDescription(key, info.name).then((desc) => {
          info.description = desc || "No description available.";
        });
      }
    }
    for (const key of selectedDetails.abilities) {
      const info = dataset.abilities[key];
      if (info && !info.description) {
        void fetchAbilityDescription(key, info.name).then((desc) => {
          info.description = desc || "No description available.";
        });
      }
    }
  }, [selectedDetails, dataset, tmhmMoveKeys, tutorMoveKeys]);

  useEffect(() => {
    setBuildName("");
    setBuildNature(NATURES[0].name);
    setBuildAbility("");
    setBuildItem("");
    setBuildEvs(emptySpread(0));
    setBuildIvs(emptySpread(31));
    setBuildMoveset(["", "", "", ""]);
    setBuildError("");
  }, [selectedSpecies]);

  const updateSpreadValue = (
    setSpread: Dispatch<SetStateAction<StatSpread>>,
    statKey: keyof StatSpread,
    rawValue: string,
    max: number,
  ) => {
    const parsed = Number.parseInt(rawValue, 10);
    const safe = Number.isNaN(parsed) ? 0 : Math.max(0, Math.min(max, parsed));
    setSpread((current) => ({ ...current, [statKey]: safe }));
  };

  const updateMovesetSlot = (index: number, moveKey: string) => {
    setBuildMoveset((current) => {
      const next = [...current];
      next[index] = moveKey;
      return next;
    });
  };

  const addBuild = () => {
    if (!selectedSpecies) {
      return;
    }

    const trimmedName = buildName.trim();
    if (!trimmedName) {
      setBuildError("Build name is required.");
      return;
    }

    const evTotal = sumSpread(buildEvs);
    if (evTotal > 510) {
      setBuildError("Total EVs cannot exceed 510.");
      return;
    }

    const chosenMoves = buildMoveset.filter(Boolean);
    if (chosenMoves.length === 0) {
      setBuildError("Choose at least one move.");
      return;
    }

    const uniqueMoves = new Set(chosenMoves);
    if (uniqueMoves.size !== chosenMoves.length) {
      setBuildError("Moveset cannot contain duplicate moves.");
      return;
    }

    const learnableSet = new Set(learnableMoveKeys);
    const hasInvalidMove = chosenMoves.some((moveKey) => !learnableSet.has(moveKey));
    if (hasInvalidMove) {
      setBuildError("Selected move is not learnable by this Pokémon.");
      return;
    }

    const abilityAllowed =
      !buildAbility
      || (selectedDetails?.abilities.includes(buildAbility) ?? false);
    if (!abilityAllowed) {
      setBuildError("Selected ability is not available for this Pokémon.");
      return;
    }

    const newBuild: PokemonBuild = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: trimmedName,
      nature: buildNature,
      ability: buildAbility,
      item: buildItem,
      evs: { ...buildEvs },
      ivs: { ...buildIvs },
      moveset: chosenMoves,
      createdAt: new Date().toISOString(),
    };

    setBuildMap((current) => ({
      ...current,
      [selectedSpecies]: [...(current[selectedSpecies] ?? []), newBuild],
    }));
    setBuildName("");
    setBuildAbility("");
    setBuildItem("");
    setBuildMoveset(["", "", "", ""]);
    setBuildError("");
  };

  const removeBuild = (buildId: string) => {
    if (!selectedSpecies) {
      return;
    }
    setBuildMap((current) => ({
      ...current,
      [selectedSpecies]: (current[selectedSpecies] ?? []).filter((build) => build.id !== buildId),
    }));
  };

  if (isLoading) {
    return (
      <main className="app-shell">
        <section className="card">
          <h1>Pokemon Unbound Tracker</h1>
          <p>Loading Pokedex and Unbound details...</p>
        </section>
      </main>
    );
  }

  if (error) {
    return (
      <main className="app-shell">
        <section className="card">
          <h1>Pokemon Unbound Tracker</h1>
          <p className="error-text">{error}</p>
          <button type="button" onClick={() => window.location.reload()}>
            Retry
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      {popoverEl}
      <section className="card">
        <header className="header">
          <div className="header-top-row">
            <div>
              <h1>Pokemon Unbound Tracker</h1>
              <p className="subtitle">Simple Pokedex companion with cached Unbound data.</p>
            </div>
            <div className="header-actions">
              <Link to="/boxes" className="account-btn">Pokedex Boxes</Link>
              {cloudSync.isCloudEnabled && (
              <div className="account-widget">
                {cloudSync.user ? (
                  <div className="account-signed-in">
                    <span className="account-email" title={cloudSync.user.email ?? ""}>
                      {cloudSync.user.email}
                    </span>
                    <span className={`sync-status sync-status-${cloudSync.syncStatus}`}>
                      {cloudSync.syncStatus === "syncing" ? "Syncing…" : "Synced"}
                    </span>
                    <button type="button" className="account-btn" onClick={() => void cloudSync.signOut()}>
                      Sign out
                    </button>
                  </div>
                ) : (
                  <div className="account-signed-out">
                    <button
                      type="button"
                      className="account-btn account-btn-primary"
                      onClick={() => setAccountMenuOpen((current) => !current)}
                    >
                      Sign in to sync
                    </button>
                    {accountMenuOpen && (
                      <div className="account-popover">
                        {cloudSync.magicLinkSent ? (
                          <p className="account-hint">
                            Check <strong>{accountEmail}</strong> for a magic sign-in link.
                          </p>
                        ) : (
                          <form
                            onSubmit={(event) => {
                              event.preventDefault();
                              if (accountEmail.trim()) {
                                void cloudSync.signInWithEmail(accountEmail.trim());
                              }
                            }}
                          >
                            <label className="account-email-label">
                              Email
                              <input
                                type="email"
                                required
                                value={accountEmail}
                                onChange={(event) => setAccountEmail(event.target.value)}
                                placeholder="you@example.com"
                              />
                            </label>
                            <button type="submit" className="account-btn account-btn-primary">
                              Send magic link
                            </button>
                          </form>
                        )}
                        {cloudSync.authError && <p className="account-error">{cloudSync.authError}</p>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            </div>
          </div>
        </header>

        {!selectedSpecies && (
          <>
        <section className="progress-card">
          <strong>
            Progress: {caughtCount}/{totalCount} ({progressPercentage}%)
          </strong>
        </section>

        <section className="controls">
          <div className="controls-top-row">
            <label htmlFor="search-input" className="search-field">
              Search
              <input
                id="search-input"
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Pikachu..."
              />
            </label>
            <button
              className={`caught-toggle-btn ${caughtOnly ? "active" : ""}`}
              onClick={() => setCaughtOnly(!caughtOnly)}
            >
              {caughtOnly ? "✓ " : ""}Show only caught
            </button>
            <button
              type="button"
              className="filters-toggle-btn"
              onClick={() => setShowFilters((current) => !current)}
              aria-expanded={showFilters}
            >
              {showFilters ? "▾ Hide filters" : "▸ Show filters"}
            </button>
          </div>

          {showFilters ? (
            <>
              <div className="controls-divider" />

              <div className="controls-columns">
                <div className="controls-column">
                  <div className="controls-type-section">
                    <h4>Types</h4>
                    <div className="type-buttons-grid">
                      {availableTypeFilters.map((type) => {
                        const isSelected = selectedTypes.has(type);
                        return (
                          <button
                            key={type}
                            className={`type-filter-btn ${isSelected ? "selected" : ""}`}
                            style={{
                              background: isSelected ? getTypeColor(type) : "transparent",
                              color: isSelected ? getTypeTextColor(type) : "#355066",
                              borderColor: getTypeColor(type),
                            }}
                            onClick={() => {
                              const next = new Set(selectedTypes);
                              if (next.has(type)) {
                                next.delete(type);
                              } else {
                                next.add(type);
                              }
                              setSelectedTypes(next);
                            }}
                          >
                            {getDisplayToken(type)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="controls-column">
                  <div className="controls-stats-section">
                    <h4>Stat Filters</h4>
                    <div className="stat-filter-container stat-filter-bst">
                      <div className="stat-filter-header">
                        <label className="stat-filter-label">Base Stat Total</label>
                        <div className="stat-values-group">
                          <input
                            type="number"
                            min={0}
                            max={800}
                            value={minBaseStat}
                            className="stat-value-input"
                            onChange={(event) => {
                              const value = Number.parseInt(event.target.value, 10);
                              const safe = Number.isNaN(value) ? 0 : Math.max(0, Math.min(800, value));
                              setMinBaseStat(Math.min(safe, maxBaseStat));
                            }}
                          />
                          <span className="stat-value-separator">–</span>
                          <input
                            type="number"
                            min={0}
                            max={800}
                            value={maxBaseStat}
                            className="stat-value-input"
                            onChange={(event) => {
                              const value = Number.parseInt(event.target.value, 10);
                              const safe = Number.isNaN(value) ? 800 : Math.max(0, Math.min(800, value));
                              setMaxBaseStat(Math.max(safe, minBaseStat));
                            }}
                          />
                        </div>
                      </div>
                      <div className="range-slider-group">
                        <span className="range-slider-track" />
                        <input
                          id="min-stat-input"
                          type="range"
                          min={0}
                          max={800}
                          step={5}
                          value={minBaseStat}
                          className="range-slider"
                          onChange={(event) => {
                            const value = Number.parseInt(event.target.value, 10);
                            setMinBaseStat(Math.min(value, maxBaseStat));
                          }}
                        />
                        <input
                          type="range"
                          min={0}
                          max={800}
                          step={5}
                          value={maxBaseStat}
                          className="range-slider"
                          onChange={(event) => {
                            const value = Number.parseInt(event.target.value, 10);
                            setMaxBaseStat(Math.max(value, minBaseStat));
                          }}
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      className="advanced-filters-toggle"
                      onClick={() => setShowAdvancedFilters((current) => !current)}
                    >
                      {showAdvancedFilters ? "▾ Hide per-stat filters" : "▸ Show per-stat filters"}
                    </button>

                    {showAdvancedFilters ? (
                      <div className="stat-filters-grid">
                        {BUILD_STATS.map((stat) => (
                          <div key={stat.key} className="stat-filter-container">
                            <div className="stat-filter-header">
                              <label className="stat-filter-label">{stat.label}</label>
                              <div className="stat-values-group">
                                <input
                                  type="number"
                                  min={0}
                                  max={255}
                                  value={statFilters[stat.key].min}
                                  className="stat-value-input"
                                  onChange={(event) => {
                                    const value = Number.parseInt(event.target.value, 10);
                                    const safe = Number.isNaN(value) ? 0 : Math.max(0, Math.min(255, value));
                                    setStatFilters((current) => ({
                                      ...current,
                                      [stat.key]: { ...current[stat.key], min: Math.min(safe, current[stat.key].max) },
                                    }));
                                  }}
                                />
                                <span className="stat-value-separator">–</span>
                                <input
                                  type="number"
                                  min={0}
                                  max={255}
                                  value={statFilters[stat.key].max}
                                  className="stat-value-input"
                                  onChange={(event) => {
                                    const value = Number.parseInt(event.target.value, 10);
                                    const safe = Number.isNaN(value) ? 255 : Math.max(0, Math.min(255, value));
                                    setStatFilters((current) => ({
                                      ...current,
                                      [stat.key]: { ...current[stat.key], max: Math.max(safe, current[stat.key].min) },
                                    }));
                                  }}
                                />
                              </div>
                            </div>
                            <div className="range-slider-group">
                              <span className="range-slider-track" />
                              <input
                                type="range"
                                min={0}
                                max={255}
                                value={statFilters[stat.key].min}
                                className="range-slider"
                                onChange={(event) => {
                                  const value = Number.parseInt(event.target.value, 10);
                                  setStatFilters((current) => ({
                                    ...current,
                                    [stat.key]: { ...current[stat.key], min: Math.min(value, current[stat.key].max) },
                                  }));
                                }}
                              />
                              <input
                                type="range"
                                min={0}
                                max={255}
                                value={statFilters[stat.key].max}
                                className="range-slider"
                                onChange={(event) => {
                                  const value = Number.parseInt(event.target.value, 10);
                                  setStatFilters((current) => ({
                                    ...current,
                                    [stat.key]: { ...current[stat.key], max: Math.max(value, current[stat.key].min) },
                                  }));
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </section>
          </>
        )}

        {selectedSpecies ? (
          <section className="details-panel details-page">
            <Link to="/" className="back-link">← Back to Pokédex</Link>
            {selectedDetails && selectedEntry ? (
              <>
                <header className="details-header">
                  <div>
                    <div className="details-title-row">
                      <h2>{selectedEntry.displayName}</h2>
                    </div>
                    <div className="type-chips">
                      {selectedDetails.types.map((type) => (
                        <span
                          key={type}
                          className="type-chip type-chip-lg"
                          style={{ background: getTypeColor(type), color: getTypeTextColor(type) }}
                        >
                          {getDisplayToken(type)}
                        </span>
                      ))}
                    </div>
                    <div className="header-pill-row">
                      <span className="header-pill-group-label">Abilities:</span>
                      {selectedDetails.abilities.map((ability) => {
                        const info = dataset?.abilities[ability];
                        return (
                          <span
                            key={ability}
                            className="tag-button"
                            data-popover-trigger="true"
                            onMouseEnter={(e) => info && popShow(e, { kind: "ability", info })}
                            onMouseMove={popMove}
                            onMouseLeave={popHide}
                            onClick={(e) => info && popToggle(e, { kind: "ability", info })}
                          >
                            {info?.name ?? getDisplayToken(ability)}
                          </span>
                        );
                      })}
                    </div>
                    <div className="header-pill-row">
                      <span className="header-pill-group-label">Held Items:</span>
                      {selectedDetails.heldItems.length > 0 ? (
                        selectedDetails.heldItems.map((item) => {
                          const info = dataset?.items[item];
                          return (
                            <span
                              key={item}
                              className="tag-button"
                              data-popover-trigger="true"
                              onMouseEnter={(e) => info && popShow(e, { kind: "item", info })}
                              onMouseMove={popMove}
                              onMouseLeave={popHide}
                              onClick={(e) => info && popToggle(e, { kind: "item", info })}
                            >
                              {info?.name ?? getDisplayToken(item)}
                            </span>
                          );
                        })
                      ) : (
                        <span className="muted">None</span>
                      )}
                    </div>
                    <div className="header-pill-row">
                      <span className="header-pill-group-label">Catch Locations:</span>
                      {selectedDetails.locations.length > 0 ? (
                        selectedDetails.locations.map((location) => (
                          <span key={`${location.mapName}-${location.method}`} className="location-chip">
                            {location.mapName} · {location.method} · Lv {location.minLevel}-{location.maxLevel}
                          </span>
                        ))
                      ) : (
                        <span className="muted">No encounter location found in loaded source.</span>
                      )}
                    </div>
                  </div>
                  {selectedImageSrc ? (
                    <img
                      className="sprite"
                      src={selectedImageSrc}
                      alt={selectedEntry.displayName}
                    />
                  ) : null}
                </header>

                <section className={`details-section ${collapsedSections.has("caught") ? "collapsed" : ""}`}>
                  <div className="details-section-header">
                    <button type="button" className="section-toggle" onClick={() => toggleSection("caught")}>
                      <span className={`chevron ${collapsedSections.has("caught") ? "collapsed" : ""}`}>▾</span>
                      <h3>Caught Pokémon</h3>
                    </button>
                    {selectedSpecies ? (
                      <button
                        type="button"
                        className={`pokeball-toggle ${caughtSpeciesMap[selectedSpecies] ? "active" : ""}`}
                        onClick={() => toggleCaughtSpecies(selectedSpecies)}
                        aria-pressed={Boolean(caughtSpeciesMap[selectedSpecies])}
                        title={caughtSpeciesMap[selectedSpecies] ? "Marked as caught" : "Mark as caught"}
                      >
                        <span className="pokeball-icon" aria-hidden="true" />
                        {caughtSpeciesMap[selectedSpecies] ? "Caught" : "Not caught"}
                      </button>
                    ) : null}
                  </div>
                  {selectedCaughtProfiles.length > 0 ? (
                    <div className="caught-list">
                      {selectedCaughtProfiles.map((profile, index) => (
                        <div key={profile.id} className="caught-card">
                          <div className="caught-card-header">
                            <span className="caught-card-title">Owned #{index + 1}</span>
                            <div className="modal-actions">
                              <button type="button" className="status-pill" onClick={() => openProfileModalForEdit(profile)}>
                                Update
                              </button>
                              <button
                                type="button"
                                className="status-pill btn-danger"
                                onClick={() => {
                                  setCaughtPokemonMap((current) => {
                                    const next = { ...current };
                                    const filtered = (next[selectedSpecies ?? ""] ?? []).filter((entry) => entry.id !== profile.id);
                                    if (filtered.length > 0) {
                                      next[selectedSpecies ?? ""] = filtered;
                                    } else {
                                      delete next[selectedSpecies ?? ""];
                                    }
                                    return next;
                                  });
                                }}
                              >
                                Remove
                              </button>
                            </div>
                          </div>

                          <div className="caught-badges">
                            <div className="caught-badge">
                              <span className="caught-badge-label">Species</span>
                              <span className="caught-badge-value">
                                {entries.find((entry) => entry.id === profile.currentSpecies)?.displayName
                                  ?? getDisplayToken(profile.currentSpecies.replace("SPECIES_", ""))}
                              </span>
                            </div>
                            <div className="caught-badge">
                              <span className="caught-badge-label">Level</span>
                              <span className="caught-badge-value">{profile.level}</span>
                            </div>
                            <div className="caught-badge">
                              <span className="caught-badge-label">Nature</span>
                              <span className="caught-badge-value">{formatNatureLabel(profile.nature)}</span>
                            </div>
                            <div className="caught-badge">
                              <span className="caught-badge-label">Ability</span>
                              <span className="caught-badge-value">
                                {profile.ability ? (
                                  (() => {
                                    const info = dataset?.abilities[profile.ability];
                                    return (
                                      <span
                                        className="tag-button"
                                        data-popover-trigger="true"
                                        onMouseEnter={(e) => info && popShow(e, { kind: "ability", info })}
                                        onMouseMove={popMove}
                                        onMouseLeave={popHide}
                                        onClick={(e) => info && popToggle(e, { kind: "ability", info })}
                                      >
                                        {info?.name ?? getDisplayToken(profile.ability)}
                                      </span>
                                    );
                                  })()
                                ) : "—"}
                              </span>
                            </div>
                            <div className="caught-badge">
                              <span className="caught-badge-label">Held Item</span>
                              <span className="caught-badge-value">
                                {profile.item ? (
                                  (() => {
                                    const info = dataset?.items[profile.item];
                                    return (
                                      <span
                                        className="tag-button"
                                        data-popover-trigger="true"
                                        onMouseEnter={(e) => info && popShow(e, { kind: "item", info })}
                                        onMouseMove={popMove}
                                        onMouseLeave={popHide}
                                        onClick={(e) => info && popToggle(e, { kind: "item", info })}
                                      >
                                        {info?.name ?? getDisplayToken(profile.item)}
                                      </span>
                                    );
                                  })()
                                ) : "—"}
                              </span>
                            </div>
                            <div className="caught-badge">
                              <span className="caught-badge-label">EVs ({sumSpread(profile.evs)}/510)</span>
                              <span className="caught-badge-value caught-spread-value">
                                {BUILD_STATS.map((stat) => `${stat.label} ${profile.evs[stat.key]}`).join(" · ")}
                              </span>
                            </div>
                            <div className="caught-badge">
                              <span className="caught-badge-label">IVs</span>
                              <span className="caught-badge-value caught-spread-value">
                                {BUILD_STATS.map((stat) => `${stat.label} ${profile.ivs[stat.key]}`).join(" · ")}
                              </span>
                            </div>
                          </div>

                          {(() => {
                            if (!selectedDetails) return null;
                            const nature = NATURE_BY_NAME.get(profile.nature);
                            const natureModifiers = getNatureModifiers(nature?.up ?? null, nature?.down ?? null);
                            const calculatedStats = calculateCaughtPokemonStats(
                              selectedDetails.stats,
                              profile.level,
                              profile.ivs,
                              profile.evs,
                              natureModifiers
                            );
                            return (
                              <div className="caught-stats-block">
                                <span className="caught-badge-label">Calculated Stats</span>
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
                            );
                          })()}

                          <div className="caught-moves-block">
                            <span className="caught-badge-label">Moves</span>
                            <span className="tag-wrap">
                              {profile.moveset.map((moveKey) => {
                                const info = dataset?.moves[moveKey];
                                return (
                                  <span
                                    key={`${profile.id}-${moveKey}`}
                                    className="tag-button"
                                    data-popover-trigger="true"
                                    onMouseEnter={(e) => info && popShow(e, { kind: "move", info })}
                                    onMouseMove={popMove}
                                    onMouseLeave={popHide}
                                    onClick={(e) => info && popToggle(e, { kind: "move", info })}
                                  >
                                    {info?.name ?? getDisplayToken(moveKey)}
                                  </span>
                                );
                              })}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="muted">
                      {selectedSpecies && ancestorCaughtSources.has(selectedSpecies) ? (
                        <>
                          Registered as an earlier evolution stage of{" "}
                          {[...ancestorCaughtSources.get(selectedSpecies)!]
                            .map((speciesKey) => entries.find((entry) => entry.id === speciesKey)?.displayName
                              ?? getDisplayToken(speciesKey.replace("SPECIES_", "")))
                            .join(", ")}
                          . See that Pokémon's page for the full caught details.
                        </>
                      ) : (
                        <>
                          This Pokémon has no owned instances yet. Add it to your{" "}
                          <Link to="/boxes">Pokedex Boxes</Link> to record its stats (requires marking it as caught first).
                        </>
                      )}
                    </p>
                  )}
                </section>

                <section className={`details-section ${collapsedSections.has("base-stats") ? "collapsed" : ""}`}>
                  <div className="details-section-header">
                    <button type="button" className="section-toggle" onClick={() => toggleSection("base-stats")}>
                      <span className={`chevron ${collapsedSections.has("base-stats") ? "collapsed" : ""}`}>▾</span>
                      <h3>Base Stats</h3>
                    </button>
                    <label className="nature-select-label">
                      Nature
                      <select
                        value={baseStatsPreviewNature}
                        onChange={(event) => setBaseStatsPreviewNature(event.target.value)}
                      >
                        {NATURES.map((nature) => (
                          <option key={nature.name} value={nature.name}>{formatNatureLabel(nature.name)}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="stats-grid">
                    {(() => {
                      const nature = NATURE_BY_NAME.get(baseStatsPreviewNature);
                      const mods = getNatureModifiers(nature?.up ?? null, nature?.down ?? null);
                      const adjustedStats: PokemonStats = {
                        hp: selectedDetails.stats.hp,
                        attack: Math.floor(selectedDetails.stats.attack * mods.attack),
                        defense: Math.floor(selectedDetails.stats.defense * mods.defense),
                        spAttack: Math.floor(selectedDetails.stats.spAttack * mods.spAttack),
                        spDefense: Math.floor(selectedDetails.stats.spDefense * mods.spDefense),
                        speed: Math.floor(selectedDetails.stats.speed * mods.speed),
                        total: 0,
                      };
                      adjustedStats.total = adjustedStats.hp + adjustedStats.attack + adjustedStats.defense
                        + adjustedStats.spAttack + adjustedStats.spDefense + adjustedStats.speed;

                      const rows: [string, number, keyof StatSpread | null][] = [
                        ["HP", adjustedStats.hp, "hp"],
                        ["Atk", adjustedStats.attack, "attack"],
                        ["Def", adjustedStats.defense, "defense"],
                        ["SpA", adjustedStats.spAttack, "spAttack"],
                        ["SpD", adjustedStats.spDefense, "spDefense"],
                        ["Spe", adjustedStats.speed, "speed"],
                        ["BST", adjustedStats.total, null],
                      ];

                      return rows.map(([label, value, statKey]) => {
                        const isBoosted = statKey && nature?.up === statKey;
                        const isReduced = statKey && nature?.down === statKey;
                        return (
                          <div key={label} className="stat-row">
                            <span className={`stat-label ${isBoosted ? "stat-boosted" : ""} ${isReduced ? "stat-reduced" : ""}`}>
                              {label}
                              {isBoosted ? " ▲" : isReduced ? " ▼" : ""}
                            </span>
                            <span className="stat-bar-wrap">
                              <span
                                className="stat-bar"
                                style={{ width: `${Math.min(100, Math.round((value / 255) * 100))}%` }}
                              />
                            </span>
                            <span className={`stat-value ${isBoosted ? "stat-boosted" : ""} ${isReduced ? "stat-reduced" : ""}`}>
                              {value}
                            </span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </section>

                <section className={`details-section ${collapsedSections.has("evolution") ? "collapsed" : ""}`}>
                  <div className="details-section-header">
                    <button type="button" className="section-toggle" onClick={() => toggleSection("evolution")}>
                      <span className={`chevron ${collapsedSections.has("evolution") ? "collapsed" : ""}`}>▾</span>
                      <h3>Evolution Chain</h3>
                    </button>
                  </div>
                  {selectedDetails.evolutions == null || selectedDetails.evolutions.children.length === 0 ? (
                    <p className="muted">Does not evolve.</p>
                  ) : (
                    <>
                      <div className="evo-tree-root">
                        <EvoTree
                          node={selectedDetails.evolutions}
                          selectedSpecies={selectedSpecies}
                          dataset={dataset}
                          onSelect={goToSpecies}
                        />
                      </div>
                      {(() => {
                        const formNodes = collectFormNodes(selectedDetails.evolutions);
                        return formNodes.length > 0 ? (
                          <div className="evo-form-group">
                            <span className="evo-form-group-label">Alternate Forms</span>
                            <div className="evo-tree-row evo-tree-row-forms">
                              {formNodes.map((formNode, i) => (
                                <EvoTree
                                  key={`${formNode.species}-${i}`}
                                  node={formNode}
                                  selectedSpecies={selectedSpecies}
                                  dataset={dataset}
                                  onSelect={goToSpecies}
                                />
                              ))}
                            </div>
                          </div>
                        ) : null;
                      })()}
                    </>
                  )}
                </section>

                <section className={`details-section ${collapsedSections.has("moves-levelup") ? "collapsed" : ""}`}>
                  <div className="details-section-header">
                    <button type="button" className="section-toggle" onClick={() => toggleSection("moves-levelup")}>
                      <span className={`chevron ${collapsedSections.has("moves-levelup") ? "collapsed" : ""}`}>▾</span>
                      <h3>Moves (Level-up)</h3>
                    </button>
                  </div>
                  {selectedDetails.levelUpMoves.length > 0 ? (
                    <MovesTable
                      moves={selectedDetails.levelUpMoves.map((learn) => ({ learn, info: dataset?.moves[learn.move] }))}
                      dataset={dataset}
                      onShow={(e, key) => { const info = dataset?.moves[key]; if (info) popShow(e, { kind: "move", info }); }}
                      onMove={popMove}
                      onHide={popHide}
                      onTap={(e, key) => { const info = dataset?.moves[key]; if (info) popToggle(e, { kind: "move", info }); }}
                    />
                  ) : (
                    <p className="muted">No level-up moves listed.</p>
                  )}
                </section>

                <section className={`details-section ${collapsedSections.has("moves-tmhm") ? "collapsed" : ""}`}>
                  <div className="details-section-header">
                    <button type="button" className="section-toggle" onClick={() => toggleSection("moves-tmhm")}>
                      <span className={`chevron ${collapsedSections.has("moves-tmhm") ? "collapsed" : ""}`}>▾</span>
                      <h3>Moves (TM/HM)</h3>
                    </button>
                  </div>
                  {movesetLoading ? (
                    <p className="muted">Loading TM/HM moves…</p>
                  ) : sortedTmhmMoveKeys.length > 0 ? (
                    <MovesTable
                      moves={sortedTmhmMoveKeys.map((move) => ({ learn: { move, level: -1 }, info: dataset?.moves[move] }))}
                      dataset={dataset}
                      onShow={(e, key) => { const info = dataset?.moves[key]; if (info) popShow(e, { kind: "move", info }); }}
                      onMove={popMove}
                      onHide={popHide}
                      onTap={(e, key) => { const info = dataset?.moves[key]; if (info) popToggle(e, { kind: "move", info }); }}
                      firstColumn={{
                        header: "TM/HM",
                        render: (entry) => tmhmNumberByMoveKey.get(entry.learn.move) ?? "—",
                      }}
                    />
                  ) : (
                    <p className="muted">No TM/HM moves listed.</p>
                  )}
                </section>

                <section className={`details-section ${collapsedSections.has("moves-tutor") ? "collapsed" : ""}`}>
                  <div className="details-section-header">
                    <button type="button" className="section-toggle" onClick={() => toggleSection("moves-tutor")}>
                      <span className={`chevron ${collapsedSections.has("moves-tutor") ? "collapsed" : ""}`}>▾</span>
                      <h3>Moves (Tutor)</h3>
                    </button>
                  </div>
                  {movesetLoading ? (
                    <p className="muted">Loading tutor moves…</p>
                  ) : tutorMoveKeys.length > 0 ? (
                    <MovesTable
                      moves={tutorMoveKeys.map((move) => ({ learn: { move, level: -1 }, info: dataset?.moves[move] }))}
                      dataset={dataset}
                      onShow={(e, key) => { const info = dataset?.moves[key]; if (info) popShow(e, { kind: "move", info }); }}
                      onMove={popMove}
                      onHide={popHide}
                      onTap={(e, key) => { const info = dataset?.moves[key]; if (info) popToggle(e, { kind: "move", info }); }}
                      firstColumn={null}
                    />
                  ) : (
                    <p className="muted">No tutor moves listed.</p>
                  )}
                </section>

                <section className={`details-section ${collapsedSections.has("moves-egg") ? "collapsed" : ""}`}>
                  <div className="details-section-header">
                    <button type="button" className="section-toggle" onClick={() => toggleSection("moves-egg")}>
                      <span className={`chevron ${collapsedSections.has("moves-egg") ? "collapsed" : ""}`}>▾</span>
                      <h3>Moves (Egg)</h3>
                    </button>
                  </div>
                  {selectedDetails.eggMoves?.length > 0 ? (
                    <MovesTable
                      moves={selectedDetails.eggMoves.map((move) => ({ learn: { move, level: -1 }, info: dataset?.moves[move] }))}
                      dataset={dataset}
                      onShow={(e, key) => { const info = dataset?.moves[key]; if (info) popShow(e, { kind: "move", info }); }}
                      onMove={popMove}
                      onHide={popHide}
                      onTap={(e, key) => { const info = dataset?.moves[key]; if (info) popToggle(e, { kind: "move", info }); }}
                      firstColumn={null}
                    />
                  ) : (
                    <p className="muted">No egg moves listed.</p>
                  )}
                </section>

                <section className={`details-section ${collapsedSections.has("builds") ? "collapsed" : ""}`}>
                  <div className="details-section-header">
                    <button type="button" className="section-toggle" onClick={() => toggleSection("builds")}>
                      <span className={`chevron ${collapsedSections.has("builds") ? "collapsed" : ""}`}>▾</span>
                      <h3>Builds</h3>
                    </button>
                  </div>
                  <p className="muted">EVs: 0-252 each (max total 510) · IVs: 0-31 each · Natures: all 25.</p>

                  <div className="build-editor">
                    <label className="build-field">
                      Build Name
                      <input
                        type="text"
                        value={buildName}
                        onChange={(event) => setBuildName(event.target.value)}
                        placeholder="e.g. Offensive Sun"
                      />
                    </label>

                    <label className="build-field">
                      Nature
                      <select
                        value={buildNature}
                        onChange={(event) => setBuildNature(event.target.value)}
                      >
                        {NATURES.map((nature) => (
                          <option key={nature.name} value={nature.name}>{formatNatureLabel(nature.name)}</option>
                        ))}
                      </select>
                    </label>

                    <label className="build-field">
                      Ability
                      <select
                        value={buildAbility}
                        onChange={(event) => setBuildAbility(event.target.value)}
                      >
                        <option value="">(none)</option>
                        {buildAbilityOptions.map((ability) => (
                          <option key={ability.key} value={ability.key}>{ability.label}</option>
                        ))}
                      </select>
                    </label>

                    <label className="build-field">
                      Item
                      <select
                        value={buildItem}
                        onChange={(event) => setBuildItem(event.target.value)}
                      >
                        <option value="">(none)</option>
                        {buildItemOptions.map((item) => (
                          <option key={item.key} value={item.key}>{item.label}</option>
                        ))}
                      </select>
                    </label>

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
                                value={buildEvs[stat.key]}
                                onChange={(event) => updateSpreadValue(setBuildEvs, stat.key, event.target.value, 252)}
                              />
                            </label>
                          ))}
                        </div>
                        <p className={sumSpread(buildEvs) > 510 ? "error-text" : "muted"}>
                          Total EVs: {sumSpread(buildEvs)}/510
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
                                value={buildIvs[stat.key]}
                                onChange={(event) => updateSpreadValue(setBuildIvs, stat.key, event.target.value, 31)}
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4>Moveset</h4>
                      <div className="build-moves-grid">
                        {buildMoveset.map((moveKey, slotIndex) => (
                          <label key={`move-slot-${slotIndex}`} className="build-field">
                            Move {slotIndex + 1}
                            <select
                              value={moveKey}
                              onChange={(event) => updateMovesetSlot(slotIndex, event.target.value)}
                            >
                              <option value="">(empty)</option>
                              {learnableMoveOptions.map((option) => {
                                const inOtherSlot =
                                  buildMoveset.includes(option.key) && buildMoveset[slotIndex] !== option.key;
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

                    <button type="button" className="btn-primary" onClick={addBuild}>Add Build</button>
                    {buildError ? <p className="error-text">{buildError}</p> : null}
                  </div>

                  {selectedBuilds.length > 0 ? (
                    <div className="build-list">
                      {selectedBuilds.map((build, index) => (
                        <article key={build.id} className="build-card">
                          <div className="build-card-header">
                            <strong>{build.name || `Build #${index + 1}`}</strong>
                            <button type="button" className="status-pill btn-danger" onClick={() => removeBuild(build.id)}>
                              Remove
                            </button>
                          </div>
                          <p><strong>Nature:</strong> {formatNatureLabel(build.nature)}</p>
                          <p>
                            <strong>Ability:</strong>{" "}
                            {build.ability
                              ? (dataset?.abilities[build.ability]?.name ?? getDisplayToken(build.ability))
                              : "—"}
                          </p>
                          <p>
                            <strong>Item:</strong>{" "}
                            {build.item
                              ? (dataset?.items[build.item]?.name ?? getDisplayToken(build.item))
                              : "—"}
                          </p>
                          <p>
                            <strong>EVs ({sumSpread(build.evs)}/510):</strong>{" "}
                            {BUILD_STATS.map((stat) => `${stat.label} ${build.evs[stat.key]}`).join(" · ")}
                          </p>
                          <p>
                            <strong>IVs:</strong>{" "}
                            {BUILD_STATS.map((stat) => `${stat.label} ${build.ivs[stat.key]}`).join(" · ")}
                          </p>
                          <p>
                            <strong>Moves:</strong>{" "}
                            {build.moveset
                              .map((moveKey) => dataset?.moves[moveKey]?.name ?? getDisplayToken(moveKey))
                              .join(", ")}
                          </p>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="muted">No builds saved for this Pokémon yet.</p>
                  )}
                </section>

              </>
            ) : (
              <p className="muted">Pokémon not found.</p>
            )}
          </section>
        ) : (
          <section className="pokedex-grid">
            {filteredEntries.length === 0 ? (
              <p className="muted">No Pokémon match the current filters.</p>
            ) : (
              visibleEntries.map((entry) => {
                const caughtCountForSpecies = caughtCountBySpecies[entry.id] ?? 0;
                const isCaught = Boolean(caughtSpeciesMap[entry.id]) || caughtCountForSpecies > 0 || ancestorCaughtSpecies.has(entry.id);
                const details = dataset?.pokemon[entry.id];
                const cardTypes = details?.types ?? [];
                const stats = details?.stats;
                return (
                  <Link
                    key={entry.id}
                    to={`/pokemon/${entry.id}`}
                    className={`pokemon-card ${isCaught ? "caught" : ""}`}
                  >
                    <div className="pokemon-card-top">
                      <span className="dex-order">#{entry.dexOrder}</span>
                      <div className="catch-btn-group">
                        <button
                          type="button"
                          className={`pokeball-toggle ${isCaught ? "active" : ""}`}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            toggleCaughtSpecies(entry.id);
                          }}
                          aria-pressed={isCaught}
                          title={isCaught ? "Marked as caught" : "Mark as caught"}
                        >
                          <span className="pokeball-icon" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    <SpriteImage
                      speciesKey={entry.id}
                      fallbackUrl={details?.spriteUrl ?? ""}
                      alt={entry.displayName}
                      className="card-sprite"
                    />
                    <span className="pokemon-name-row">
                      <span className="pokemon-name">{entry.displayName}</span>
                      {caughtCountForSpecies > 0 ? <span className="caught-count-badge">{caughtCountForSpecies}</span> : null}
                    </span>
                    <div className="pokemon-row-types">
                      {cardTypes.map((type) => (
                        <span
                          key={`${entry.id}-${type}`}
                          className="type-chip"
                          style={{ background: getTypeColor(type), color: getTypeTextColor(type) }}
                        >
                          {getDisplayToken(type)}
                        </span>
                      ))}
                    </div>
                    {stats ? (
                      <div className="card-stats">
                        <div className="card-bst">
                          BST <strong>{stats.total}</strong>
                        </div>
                        <div className="mini-stat-bars">
                          {([
                            ["HP", stats.hp],
                            ["Atk", stats.attack],
                            ["Def", stats.defense],
                            ["SpA", stats.spAttack],
                            ["SpD", stats.spDefense],
                            ["Spe", stats.speed],
                          ] as const).map(([label, value]) => (
                            <div key={label} className="mini-stat-row">
                              <span className="mini-stat-label">{label}</span>
                              <span className="mini-stat-bar-wrap">
                                <span
                                  className="mini-stat-bar"
                                  style={{ width: `${Math.min(100, Math.round((value / 180) * 100))}%` }}
                                />
                              </span>
                              <span className="mini-stat-value">{value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </Link>
                );
              })
            )}
          </section>
        )}

        {!selectedSpecies && visibleCount < filteredEntries.length ? (
          <div ref={loadMoreRef} className="grid-load-more">
            <span className="muted">Loading more Pokémon…</span>
          </div>
        ) : null}
      </section>

      {profileModalSpecies && dataset ? (
        <CaughtProfileModal
          dataset={dataset}
          entries={entries}
          originalSpecies={profileModalSpecies}
          initialProfile={profileModalEditing}
          onSave={saveProfile}
          onClose={closeProfileModal}
        />
      ) : null}
    </main>
  );
}

export default App;
