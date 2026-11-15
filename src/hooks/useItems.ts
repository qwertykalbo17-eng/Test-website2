import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import type { Item } from "../types";

/** The item catalog (names, values, images) from the `items` table. */
export function useItems(enabled: boolean): Item[] {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    supabase
      .from("items")
      .select("name, value, image")
      .order("value", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.error("Error loading items:", error);
          return;
        }
        if (!cancelled) {
          setItems(
            (data ?? []).map((r: any) => ({ name: r.name, value: Number(r.value), image: r.image }))
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return items;
}
