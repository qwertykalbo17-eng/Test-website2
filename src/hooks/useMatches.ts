import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";
import type { Match } from "../types";

const POLL_MS = 4000;

/**
 * Live match data:
 *  - open:   matches waiting for a player
 *  - recent: the last finished matches from everyone
 *  - unseen: your finished matches whose flip you haven't watched yet
 * Updates instantly through Supabase Realtime, and a slow poll acts as a safety net.
 */
export function useMatches(userId: string | null) {
  const [open, setOpen] = useState<Match[]>([]);
  const [recent, setRecent] = useState<Match[]>([]);
  const [unseen, setUnseen] = useState<Match[]>([]);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    const mineFilter = userId
      ? `and(creator_id.eq.${userId},creator_seen.eq.false),` +
        `and(joiner_id.eq.${userId},joiner_seen.eq.false)`
      : null;

    const [o, r, u] = await Promise.all([
      supabase
        .from("matches")
        .select("*")
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("matches")
        .select("*")
        .eq("status", "finished")
        .order("finished_at", { ascending: false })
        .limit(15),
      // guests have no unwatched flips
      mineFilter
        ? supabase
            .from("matches")
            .select("*")
            .eq("status", "finished")
            .or(mineFilter)
            .order("finished_at", { ascending: true })
            .limit(10)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (mine !== seq.current) return;
    if (o.error || r.error || u.error) {
      console.error("Error loading matches:", o.error ?? r.error ?? u.error);
      return;
    }
    setOpen(o.data as Match[]);
    setRecent(r.data as Match[]);
    setUnseen((u.data ?? []) as Match[]);
  }, [userId]);

  useEffect(() => {
    setUnseen([]);
    refresh();
    const timer = setInterval(refresh, POLL_MS);

    let debounce: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel("matches-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () => {
        clearTimeout(debounce);
        debounce = setTimeout(refresh, 150);
      })
      .subscribe();

    return () => {
      clearInterval(timer);
      clearTimeout(debounce);
      supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  return { open, recent, unseen, refresh };
}
