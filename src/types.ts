export type Side = "Heads" | "Tails";

export interface Item {
  name: string;
  value: number;
  image: string;
  /** How many are left in the marketplace (only set for catalog items). */
  stock?: number;
  /** Value list info (0-10, stability id, free-text range). */
  demand?: number | null;
  rarity?: number | null;
  stability?: string | null;
  value_range?: string | null;
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

export type WheelTarget = "2x" | "3x" | "5x" | "10x" | "bonus" | "coinflip";
export type WheelResult = WheelTarget | "double" | "triple";

/** What the `wheel_state()` function returns. Times are milliseconds since 1970 (server clock). */
export interface WheelState {
  now: number;
  id: number;
  betting_ends_at: number;
  spin_ends_at: number;
  ends_at: number;
  /** null until betting has closed */
  result: WheelResult | null;
  /** optional multiplier boost (e.g. 2 or 3) applied to multipliers below bet choices */
  boost_mult?: number | null;
  /** what a bet on the winning segment pays (2, 3, 5, 10, 11-99 bonus, 7 or 25 coinflip) */
  mult: number | null;
  totals: Partial<Record<WheelTarget, { coins: number; players: number }>>;
  mine: Partial<Record<WheelTarget, number>>;
  history: { id: number; result: WheelResult; mult: number; boost_mult?: number | null }[];
}

export interface AdminPlayer {
  id: string;
  username: string;
  coins: number;
  profit: number;
  total_wagered: number;
  is_admin: boolean;
}
