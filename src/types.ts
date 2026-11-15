export type Side = "Heads" | "Tails";

export type BattleFormat = "1v1" | "1v1v1" | "2v2";

export type BattleMode = "normal" | "crazy";

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

/** An item that can be dropped from a case. */
export interface CaseItem extends Item {
  chance: number;
}

/** A case definition used by the admin panel and case battles. */
export interface CaseDef {
  id: string;
  name: string;
  image: string;
  price: number;
  active: boolean;
  items: CaseItem[];
}

/** A player slot inside a case battle. */
export interface BattlePlayer {
  user_id: string;
  name: string;
  is_bot: boolean;
}

/** One round of a case battle. Each slot receives one item. */
export type BattleRound = Item[];

/** Result of a completed case battle. */
export interface CaseBattleResult {
  winner_slots: number[];
  rounds: BattleRound[];
  items_won: number;
  team_totals: number[];
}

/** A case battle. */
export interface CaseBattle {
  id: string;
  status: "open" | "finished" | "cancelled";
  creator_id: string;
  mode: BattleMode;
  format: BattleFormat;
  cost: number;
  slots: number;
  cases: CaseDef[];
  players: Array<BattlePlayer | null>;
  result: CaseBattleResult | null;
  created_at: string;
  finished_at: string | null;
}

/** Player information returned to the admin panel. */
export interface AdminPlayer {
  id: string;
  username: string;
  coins: number;
  profit: number;
  is_admin: boolean;
}

export interface Snapshot {
  coins: number;
  inventory: InvItem[];
  profit: number;
  totalWagered: number;
  isAdmin: boolean;
}

export interface LeaderboardEntry {
  username: string;
  totalWagered: number;
  profit: number;
}