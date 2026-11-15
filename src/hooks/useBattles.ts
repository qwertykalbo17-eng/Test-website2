import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase";
import type { CaseBattle } from "../types";

const POLL_MS = 4000;

/** Open case battles and the latest finished ones. Live through Realtime, with a slow poll as a backup. */
export function useBattles() {
  const [open, setOpen] = useState<CaseBattle[]>([]);
  const [recent, setRecent] = useState<CaseBattle[]>([]);

  const refresh = useCallback(async () => {
    const [o, r] = await Promise.all([
      supabase
        .from("battles")
        .select("*")
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("battles")
        .select("*")
        .eq("status", "finished")
        .order("finished_at", { ascending: false })
        .limit(10),
    ]);
    if (o.error || r.error) {
      console.error("Error loading battles:", o.error ?? r.error);
      return;
    }
    setOpen(o.data as CaseBattle[]);
    setRecent(r.data as CaseBattle[]);
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_MS);

    let debounce: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel("battles-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "battles" }, () => {
        clearTimeout(debounce);
        debounce = setTimeout(refresh, 150);
      })
      .subscribe();

    return () => {
      clearInterval(timer);
      clearTimeout(debounce);
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  return { open, recent, refresh };
}
