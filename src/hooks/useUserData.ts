import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../supabase";
import type { InvItem, Snapshot } from "../types";
import { preloadImages } from "../utils";

const EMPTY: Snapshot = { isAdmin: false, coins: 0, inventory: [], profit: 0, totalWagered: 0 };
const PAGE = 1000;
const CACHE_KEY = "bloxybet.snapshot.";

/** Last known snapshot, shown instantly while the fresh one loads. */
function readCache(userId: string): Snapshot | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY + userId);
    return raw ? (JSON.parse(raw) as Snapshot) : null;
  } catch {
    return null;
  }
}
function writeCache(userId: string, snap: Snapshot) {
  try {
    localStorage.setItem(CACHE_KEY + userId, JSON.stringify(snap));
  } catch {
    /* storage unavailable or full: fine */
  }
}

async function fetchInventory(userId: string): Promise<InvItem[]> {
  const out: InvItem[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("inventory_items")
      .select("id, match_id, item:items(name, value, image)")
      .eq("user_id", userId)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw error;

    for (const row of data ?? []) {
      const item = Array.isArray(row.item) ? row.item[0] : row.item;
      if (!item) continue;
      out.push({
        id: row.id,
        name: item.name,
        value: Number(item.value),
        image: item.image,
        locked: row.match_id !== null,
      });
    }
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/**
 * Your coins, profit and inventory, read from the database. The browser never writes these:
 * only the database functions change them, so call refresh() after an action.
 */
export function useUserData(user: User | null) {
  const userId = user?.id ?? null;
  const [data, setData] = useState<Snapshot>(EMPTY);
  const [loading, setLoading] = useState(false);
  const held = useRef(false);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const mine = ++seq.current;
    try {
      const [profile, inventory] = await Promise.all([
        supabase.from("profiles").select("profit, total_wagered, coins, is_admin").eq("id", userId).maybeSingle(),
        fetchInventory(userId),
      ]);
      if (profile.error) throw profile.error;
      // ignore out-of-date answers, and don't spoil a flip that is still playing
      if (mine !== seq.current || held.current) return;
      const snap: Snapshot = {
        isAdmin: profile.data?.is_admin === true,
        coins: Number(profile.data?.coins) || 0,
        inventory,
        profit: Number(profile.data?.profit) || 0,
        totalWagered: Number(profile.data?.total_wagered) || 0,
      };
      preloadImages(inventory.map((i) => i.image));
      writeCache(userId, snap);
      setData(snap);
    } catch (e) {
      console.error("Error loading user data:", e);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setData(EMPTY);
      return;
    }
    let cancelled = false;
    const cached = readCache(userId);
    if (cached) {
      preloadImages(cached.inventory.map((i) => i.image));
      setData(cached);
    }
    setLoading(!cached);
    refresh().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, refresh]);

  /** Freeze the numbers on screen (used while a flip animation plays). */
  const hold = useCallback(() => {
    held.current = true;
  }, []);

  /** Unfreeze and load the latest numbers. */
  const release = useCallback(async () => {
    held.current = false;
    await refresh();
  }, [refresh]);

  return { data, loading, refresh, hold, release };
}
