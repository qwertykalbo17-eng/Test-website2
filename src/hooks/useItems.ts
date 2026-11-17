import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase";
import type { Item } from "../types";

/** The item catalog (names, values, images, marketplace stock) from the `items` table. */
export function useItems(enabled: boolean) {
  const [items, setItems] = useState<Item[]>([]);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("items")
      .select("name, value, image, stock")
      .order("value", { ascending: true });
    if (error) {
      console.error("Error loading items:", error);
      return;
    }
    setItems(
      (data ?? []).map((r: any) => ({
        name: r.name,
        value: Number(r.value),
        image: r.image,
        stock: Number(r.stock) || 0,
      }))
    );
  }, []);

  useEffect(() => {
    if (enabled) refresh();
  }, [enabled, refresh]);

  return { items, refresh };
}
