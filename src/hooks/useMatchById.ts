import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import type { Match } from "../types";

const POLL_MS = 1500;

/**
 * Keeps one match up to date (e.g. while its info window is open), so the right side
 * switches from "Waiting" to the joiner the moment someone joins.
 */
export function useMatchById(seed: Match | null): Match | null {
  const id = seed?.id ?? null;
  const [match, setMatch] = useState<Match | null>(seed);

  useEffect(() => {
    setMatch(seed);
    if (!id) return;
    let cancelled = false;

    async function load() {
      const { data, error } = await supabase.from("matches").select("*").eq("id", id).maybeSingle();
      if (!cancelled && !error && data) setMatch(data as Match);
    }

    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // only restart when a different match is opened
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return match;
}
