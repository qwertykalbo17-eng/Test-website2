export type Side = "Heads" | "Tails";

export interface Item {
  name: string;
  value: number;
  image: string;
  /** How many are left in the marketplace (only set for catalog items). */
  stock?: number;
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
  isAdmin: boolean;
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

/** One item inside a case, with its chance (percent). */
export interface CaseItem extends Item {
  chance: number;
}

export interface CaseDef {
  id: string;
  name: string;
  image: string | null;
  /** price in coins */
  price: number;
  active: boolean;
  items: CaseItem[];
}

export type BattleMode = "normal" | "crazy";
export type BattleFormat = "1v1" | "1v1v1" | "2v2";

export interface BattlePlayer {
  user_id: string | null;
  name: string;
  is_bot: boolean;
}

export interface BattleResult {
  /** rounds[round][slot] = the item that slot pulled */
  rounds: Item[][];
  totals: number[];
  team_totals: number[];
  winning_team: number;
  winner_slots: number[];
  items_won: number;
}

/** One row of the `battles` table. */
export interface CaseBattle {
  id: string;
  status: "open" | "finished" | "cancelled";
  mode: BattleMode;
  format: BattleFormat;
  slots: number;
  cases: { id: string; name: string; image: string | null; price: number }[];
  /** coins each player pays */
  cost: number;
  creator_id: string;
  /** one entry per slot, null while the slot is empty */
  players: (BattlePlayer | null)[];
  result: BattleResult | null;
  created_at: string;
  finished_at: string | null;
}

export interface AdminPlayer {
  id: string;
  username: string;
  coins: number;
  profit: number;
  total_wagered: number;
  is_admin: boolean;
}
