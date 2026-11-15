export type Side = "Heads" | "Tails";

export interface Item {
  name: string;
  value: number;
  image: string;
}

/** An item you own. `locked` means it is inside one of your open matches. */
export interface InvItem extends Item {
  id: string;
  locked: boolean;
}

/** One row of the `matches` table. Creator is shown on the left, joiner (or bot) on the right. */
export interface Match {
  id: string;
  status: "open" | "finished" | "cancelled";
  creator_id: string;
  creator_name: string;
  creator_side: Side;
  creator_items: Item[];
  creator_total: number;
  joiner_id: string | null;
  joiner_name: string | null;
  joiner_items: Item[] | null;
  joiner_total: number | null;
  is_bot: boolean;
  flip: Side | null;
  winner: "creator" | "joiner" | null;
  creator_seen: boolean;
  joiner_seen: boolean;
  created_at: string;
  finished_at: string | null;
  tax_items: Item[];
  tax_total: number;
}

export interface Snapshot {
  coins: number;
  inventory: InvItem[];
  profit: number;
  totalWagered: number;
}

export interface LeaderboardEntry {
  username: string;
  totalWagered: number;
  profit: number;
}
