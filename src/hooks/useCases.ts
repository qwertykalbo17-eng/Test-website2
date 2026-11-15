import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase";
import type { CaseDef } from "../types";

/** All cases (admins also get the hidden ones, the database decides). */
export function useCases(userId: string | null) {
  const [cases, setCases] = useState<CaseDef[]>([]);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("cases")
      .select("id, name, image, price, active, case_items(chance, item:items(name, value, image))")
      .order("price", { ascending: true });
    if (error) {
      console.error("Error loading cases:", error);
      return;
    }
    setCases(
      (data ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        image: r.image,
        price: Number(r.price),
        active: r.active,
        items: (r.case_items ?? [])
          .map((ci: any) => {
            const item = Array.isArray(ci.item) ? ci.item[0] : ci.item;
            return item
              ? { name: item.name, value: Number(item.value), image: item.image, chance: Number(ci.chance) }
              : null;
          })
          .filter(Boolean)
          .sort((a: any, b: any) => b.chance - a.chance),
      }))
    );
  }, []);

  // reload when logging in / out (admins can see hidden cases)
  useEffect(() => {
    refresh();
  }, [refresh, userId]);

  return { cases, refresh };
}
