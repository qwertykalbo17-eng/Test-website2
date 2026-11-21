import { useCallback, useEffect, useRef, useState } from "react";
import { wheelState } from "../api";
import type { WheelState } from "../types";

/**
 * The shared wheel. It always keeps the state fresh while the tab is visible: fast while `active` (the wheel page is open), slowly otherwise. It asks the
 * database for the current round every second or so.
 *
 * `offset` = server clock minus this device's clock, so every player sees the same countdown and
 * spin no matter what their own clock says. Server time now = Date.now() + offset.
 */
/** How often to ask while the wheel page is closed (the server keeps the rounds running by itself). */
const BACKGROUND_MS = 5000;

export function useWheel(active: boolean) {
  const [state, setState] = useState<WheelState | null>(null);
  const [offset, setOffset] = useState(0);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    const sent = Date.now();
    try {
      const s = await wheelState();
      if (mine !== seq.current) return; // an older answer arrived late
      const received = Date.now();
      // the server stamped `now` somewhere between send and receive: use the middle
      setOffset(s.now - (sent + received) / 2);
      setState(s);
    } catch (e) {
      console.error("Error loading the wheel:", e);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(() => {
      if (!document.hidden) refresh();
    }, active ? 1500 : BACKGROUND_MS);
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