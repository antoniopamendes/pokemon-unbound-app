import { useCallback, useEffect, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "./supabaseClient";
import type { BoxesData, BuildMap, CaughtPokemonMap } from "./types";

export type CloudSyncStatus = "idle" | "syncing" | "synced" | "error";

function isCaughtMapEmpty(map: CaughtPokemonMap | undefined): boolean {
  return !map || Object.keys(map).length === 0;
}

function isBuildMapEmpty(map: BuildMap | undefined): boolean {
  return !map || Object.keys(map).length === 0;
}

function isBoxesDataEmpty(boxes: BoxesData | undefined): boolean {
  return !boxes || boxes.every((box) => box.slots.every((slot) => slot === null));
}

/**
 * Optional cloud sync via Supabase (magic-link auth + a single JSONB row per user).
 * When Supabase env vars aren't configured, everything here is a no-op and the app
 * keeps working purely off localStorage, so this feature is fully opt-in.
 *
 * Each caller only passes the slice(s) of data it owns (e.g. the main Pokedex page
 * owns caughtPokemonMap/buildMap, the Boxes page owns boxesData). Only the columns a
 * caller owns are pushed to Supabase, so one page can never silently wipe out data
 * managed by another page.
 */
export function useCloudSync(params: {
  caughtPokemonMap?: CaughtPokemonMap;
  setCaughtPokemonMap?: (value: CaughtPokemonMap) => void;
  buildMap?: BuildMap;
  setBuildMap?: (value: BuildMap) => void;
  boxesData?: BoxesData;
  setBoxesData?: (value: BoxesData) => void;
}) {
  const { caughtPokemonMap, setCaughtPokemonMap, buildMap, setBuildMap, boxesData, setBoxesData } = params;
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatus>("idle");
  const suppressPushRef = useRef(false);
  const hasPulledRef = useRef(false);
  const pushTimerRef = useRef<number | null>(null);
  const latestLocalRef = useRef({ caughtPokemonMap, buildMap, boxesData });
  latestLocalRef.current = { caughtPokemonMap, buildMap, boxesData };

  const user: User | null = session?.user ?? null;

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (!newSession) {
        hasPulledRef.current = false;
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Pull remote data once per sign-in; migrate local data up on a brand-new account.
  useEffect(() => {
    if (!supabase || !user || hasPulledRef.current) {
      return;
    }
    hasPulledRef.current = true;
    setSyncStatus("syncing");
    const client = supabase;

    const run = async () => {
      const { data, error } = await client
        .from("user_data")
        .select("caught_pokemon_map, build_map, boxes_data")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.warn("Failed to load cloud data", error);
        setSyncStatus("error");
        return;
      }

      suppressPushRef.current = true;
      const remoteCaught = (data?.caught_pokemon_map as CaughtPokemonMap | undefined) ?? {};
      const remoteBuild = (data?.build_map as BuildMap | undefined) ?? {};
      const remoteBoxes = (data?.boxes_data as BoxesData | undefined) ?? [];

      // If the remote column looks empty but we already have local data for it, this row was
      // likely created by another page that doesn't own this column — keep local data instead
      // of wiping it, and let the push effect below upload it.
      if (setCaughtPokemonMap) {
        const keepLocal = isCaughtMapEmpty(remoteCaught) && !isCaughtMapEmpty(latestLocalRef.current.caughtPokemonMap);
        if (!keepLocal) {
          setCaughtPokemonMap(remoteCaught);
        }
      }
      if (setBuildMap) {
        const keepLocal = isBuildMapEmpty(remoteBuild) && !isBuildMapEmpty(latestLocalRef.current.buildMap);
        if (!keepLocal) {
          setBuildMap(remoteBuild);
        }
      }
      if (setBoxesData) {
        const keepLocal = isBoxesDataEmpty(remoteBoxes) && !isBoxesDataEmpty(latestLocalRef.current.boxesData);
        if (!keepLocal && remoteBoxes.length > 0) {
          setBoxesData(remoteBoxes);
        }
      }

      window.setTimeout(() => {
        suppressPushRef.current = false;
      }, 0);
      setSyncStatus("synced");
    };

    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Push local changes up to the cloud (debounced) once signed in.
  useEffect(() => {
    if (!supabase || !user || suppressPushRef.current || !hasPulledRef.current) {
      return;
    }
    if (pushTimerRef.current) {
      window.clearTimeout(pushTimerRef.current);
    }
    setSyncStatus("syncing");
    const client = supabase;
    pushTimerRef.current = window.setTimeout(() => {
      const payload: Record<string, unknown> = {
        user_id: user.id,
        updated_at: new Date().toISOString(),
      };
      if (setCaughtPokemonMap) {
        payload.caught_pokemon_map = caughtPokemonMap ?? {};
      }
      if (setBuildMap) {
        payload.build_map = buildMap ?? {};
      }
      if (setBoxesData) {
        payload.boxes_data = boxesData ?? [];
      }
      void client
        .from("user_data")
        .upsert(payload)
        .then(({ error }) => {
          setSyncStatus(error ? "error" : "synced");
          if (error) {
            console.warn("Failed to sync to cloud", error);
          }
        });
    }, 800);
    return () => {
      if (pushTimerRef.current) {
        window.clearTimeout(pushTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caughtPokemonMap, buildMap, boxesData, user]);

  const signInWithEmail = useCallback(async (email: string) => {
    if (!supabase) {
      return;
    }
    setAuthError(null);
    setMagicLinkSent(false);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      setAuthError(error.message);
    } else {
      setMagicLinkSent(true);
    }
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) {
      return;
    }
    await supabase.auth.signOut();
    hasPulledRef.current = false;
  }, []);

  return {
    isCloudEnabled: isSupabaseConfigured,
    user,
    authLoading,
    magicLinkSent,
    authError,
    syncStatus,
    signInWithEmail,
    signOut,
    clearMagicLinkSent: () => setMagicLinkSent(false),
  };
}
