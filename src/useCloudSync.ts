import { useCallback, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  fingerprintDataSnapshot,
  LOCAL_DATA_CHANGED_EVENT,
  loadDataSnapshot,
  normalizeDataSnapshot,
  replaceDataSnapshot,
} from "./storage";
import { isSupabaseConfigured, supabase } from "./supabaseClient";

export type CloudSyncStatus = "idle" | "syncing" | "synced" | "error";
type SyncResult = { ok: boolean; reason?: "not-authenticated" | "error" | "missing" };

const LAST_CLOUD_FINGERPRINT_PREFIX = "unbound-tracker-last-cloud-fingerprint-v1:";

function fingerprintKey(userId: string): string {
  return `${LAST_CLOUD_FINGERPRINT_PREFIX}${userId}`;
}

/**
 * Optional cloud sync via Supabase (magic-link auth + a single JSONB row per user).
 * Local storage remains the source of truth while the app is open. Cloud reads and
 * writes happen only when the user explicitly invokes one of the sync operations.
 */
export function useCloudSync() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatus>("idle");
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [localFingerprint, setLocalFingerprint] = useState(() => fingerprintDataSnapshot());
  const [lastCloudFingerprint, setLastCloudFingerprint] = useState<string | null>(null);

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
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const onLocalDataChanged = () => {
      setLocalFingerprint(fingerprintDataSnapshot());
      setSyncStatus((current) => (current === "syncing" ? current : "idle"));
      setSyncMessage(null);
    };
    window.addEventListener(LOCAL_DATA_CHANGED_EVENT, onLocalDataChanged);
    return () => window.removeEventListener(LOCAL_DATA_CHANGED_EVENT, onLocalDataChanged);
  }, []);

  useEffect(() => {
    if (!user) {
      setLastCloudFingerprint(null);
      setSyncStatus("idle");
      setSyncMessage(null);
      return;
    }
    setLastCloudFingerprint(localStorage.getItem(fingerprintKey(user.id)));
    setSyncStatus("idle");
    setSyncMessage(null);
  }, [user]);

  const hasPendingChanges = Boolean(
    user && (lastCloudFingerprint === null || localFingerprint !== lastCloudFingerprint),
  );

  const pushChanges = useCallback(async (): Promise<SyncResult> => {
    if (!supabase || !user) {
      return { ok: false, reason: "not-authenticated" };
    }

    setSyncStatus("syncing");
    setSyncMessage(null);
    const snapshot = loadDataSnapshot();
    const uploadedFingerprint = fingerprintDataSnapshot(snapshot);
    const { error } = await supabase.from("user_data").upsert({
      user_id: user.id,
      caught_pokemon_map: snapshot.caughtPokemonMap,
      build_map: snapshot.buildMap,
      boxes_data: snapshot.boxesData,
      caught_species_map: snapshot.caughtSpeciesMap,
      party_data: snapshot.partyData,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      console.warn("Failed to push changes to cloud", error);
      setSyncStatus("error");
      setSyncMessage("Push failed. Your local changes were kept.");
      return { ok: false, reason: "error" };
    }

    localStorage.setItem(fingerprintKey(user.id), uploadedFingerprint);
    setLastCloudFingerprint(uploadedFingerprint);
    const currentFingerprint = fingerprintDataSnapshot();
    setLocalFingerprint(currentFingerprint);
    setSyncStatus("synced");
    setSyncMessage(
      currentFingerprint === uploadedFingerprint
        ? "Changes pushed to cloud."
        : "Changes pushed; newer local changes are still pending.",
    );
    return { ok: true };
  }, [user]);

  const restoreCloudVersion = useCallback(async (): Promise<SyncResult> => {
    if (!supabase || !user) {
      return { ok: false, reason: "not-authenticated" };
    }

    setSyncStatus("syncing");
    setSyncMessage(null);
    const { data, error } = await supabase
      .from("user_data")
      .select("caught_pokemon_map, build_map, boxes_data, caught_species_map, party_data")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.warn("Failed to restore cloud version", error);
      setSyncStatus("error");
      setSyncMessage("Restore failed. Your local changes were kept.");
      return { ok: false, reason: "error" };
    }

    if (!data) {
      setSyncStatus("error");
      setSyncMessage("No cloud save exists yet. Your local changes were kept.");
      return { ok: false, reason: "missing" };
    }

    const snapshot = normalizeDataSnapshot({
      caughtPokemonMap: data.caught_pokemon_map,
      buildMap: data.build_map,
      boxesData: data.boxes_data,
      caughtSpeciesMap: data.caught_species_map,
      partyData: data.party_data,
    });
    replaceDataSnapshot(snapshot);
    const restoredFingerprint = fingerprintDataSnapshot(snapshot);
    localStorage.setItem(fingerprintKey(user.id), restoredFingerprint);
    setLastCloudFingerprint(restoredFingerprint);
    setLocalFingerprint(restoredFingerprint);
    setSyncStatus("synced");
    setSyncMessage("Cloud version restored.");
    return { ok: true };
  }, [user]);

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
    setSyncStatus("idle");
    setSyncMessage(null);
  }, []);

  return {
    isCloudEnabled: isSupabaseConfigured,
    user,
    authLoading,
    magicLinkSent,
    authError,
    syncStatus,
    syncMessage,
    hasPendingChanges,
    pushChanges,
    restoreCloudVersion,
    signInWithEmail,
    signOut,
    clearMagicLinkSent: () => setMagicLinkSent(false),
  };
}

export type CloudSyncApi = ReturnType<typeof useCloudSync>;
