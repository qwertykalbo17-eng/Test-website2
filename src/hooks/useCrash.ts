import { useCallback, useEffect, useRef, useState } from "react";
import { crashState } from "../api";
import type { CrashState } from "../types";

/**
 * The shared crash round. While `active` (the crash page is open and the tab is visible) it asks
 * the database for the current round about twice a second.
 *
 * `offset` = server clock minus this device's clock, so every player sees the same launch and
 * the same multiplier. Server time now = Date.now() + offset.
 */
export function useCrash(active: boolean) {
  const [state, setState] = useState<CrashState | null>(null);
  const [offset, setOffset] = useState(0);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    const sent = Date.now();
    try {
      const s = await crashState();
      if (mine !== seq.current) return; // an older answer arrived late
      const received = Date.now();
      setOffset(s.now - (sent + received) / 2);
      setState(s);
    } catch (e) {
      console.error("Error loading crash:", e);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    refresh();
    const t = setInterval(() => {
      if (!document.hidden) refresh();
    }, 500);
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active, refresh]);

  return { state, offset, refresh };
}