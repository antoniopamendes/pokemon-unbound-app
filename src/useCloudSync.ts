import { useCallback, useEffect, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "./supabaseClient";
import type { BuildMap, CaughtPokemonMap } from "./types";

export type CloudSyncStatus = "idle" | "syncing" | "synced" | "error";

/**
 * Optional cloud sync via Supabase (magic-link auth + a single JSONB row per user).
 * When Supabase env vars aren't configured, everything here is a no-op and the app
 * keeps working purely off localStorage, so this feature is fully opt-in.
 */
export function useCloudSync(params: {
  caughtPokemonMap: CaughtPokemonMap;
  buildMap: BuildMap;
  setCaughtPokemonMap: (value: CaughtPokemonMap) => void;
  setBuildMap: (value: BuildMap) => void;
}) {
  const { caughtPokemonMap, buildMap, setCaughtPokemonMap, setBuildMap } = params;
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatus>("idle");
  const suppressPushRef = useRef(false);
  const hasPulledRef = useRef(false);
  const pushTimerRef = useRef<number | null>(null);
  const latestLocalRef = useRef({ caughtPokemonMap, buildMap });
  latestLocalRef.current = { caughtPokemonMap, buildMap };

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
        .select("caught_pokemon_map, build_map")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.warn("Failed to load cloud data", error);
        setSyncStatus("error");
        return;
      }

      suppressPushRef.current = true;
      if (data) {
        setCaughtPokemonMap((data.caught_pokemon_map as CaughtPokemonMap) ?? {});
        setBuildMap((data.build_map as BuildMap) ?? {});
      } else {
        await client.from("user_data").upsert({
          user_id: user.id,
          caught_pokemon_map: latestLocalRef.current.caughtPokemonMap,
          build_map: latestLocalRef.current.buildMap,
          updated_at: new Date().toISOString(),
        });
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
      void client
        .from("user_data")
        .upsert({
          user_id: user.id,
          caught_pokemon_map: caughtPokemonMap,
          build_map: buildMap,
          updated_at: new Date().toISOString(),
        })
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
  }, [caughtPokemonMap, buildMap, user]);

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
