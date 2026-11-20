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

/** One row of the `value_items` table (the value list). */
export interface ValueItem extends Item {
  id?: string;
}

/** One row of the `profiles` table. */
export interface Profile {
  id: string;
  username: string;
  coins: number;
  profit: number;
  total_wagered: number;
  is_admin: boolean;
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

/** What `get_match_view()` returns. Adjust if your SQL function adds extra fields. */
export type MatchView = Match;

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

export type WheelTarget = "2x" | "3x" | "5x" | "10x" | "coinflip" | "bonus" | "crazytime";

export type CrazyArrowColor = "red" | "green" | "blue";

export interface CrazyArrowOutcome {
  color: CrazyArrowColor;
  /** Final multiplier for this arrow after pre-spin boost, board doubles, and any respins */
  finalMult: number;
  /** Steps/history of what this arrow landed on (e.g. ["DOUBLE (x2)", "30x"]) */
  steps: string[];
}

export interface CrazyBonusData {
  /** Base multipliers after any pre-spin wheel boost_mult */
  baseMultipliers: Record<CrazyArrowColor, number>;
  /** Number of DOUBLE slots placed on this round's board (5..10) */
  doubleCount: number;
  /** Final double factor applied to the board from DOUBLE hits */
  boardDoubleFactor: number;
  /** Highest multiplier among red, green, and blue arrows (recorded in round history) */
  highestMult: number;
  arrows: Record<CrazyArrowColor, CrazyArrowOutcome>;
}

/** What the `wheel_state()` function returns. Times are milliseconds since 1970 (server clock). */
export interface WheelState {
  now: number;
  id: number;
  betting_ends_at: number;
  spin_ends_at: number;
  ends_at: number;
  /** Highest multiplier seen in the last 100 rounds */
  best_mult?: number | null;
  /** Random segment boosted this round (null when no event occurs) */
  boost_target: WheelTarget | null;
  /** 1 = normal, or boost multiplier (e.g. 2, 3, 5, 10, 50) */
  boost_mult: number;
  /** null until betting has closed */
  result: WheelTarget | null;
  /** base multiplier of the winning segment (or highest Crazy Time arrow mult for history) */
  mult: number | null;
  /** Server-provided Crazy Time details when result === "crazytime" */
  crazy_bonus?: CrazyBonusData | null;
  /** The current player's chosen arrow color when Crazy Time hits */
  my_arrow?: CrazyArrowColor | null;
  totals: Partial<Record<WheelTarget, { coins: number; players: number }>>;
  mine: Partial<Record<WheelTarget, number>>;
  history: { id: number; result: WheelTarget; mult: number }[];
}

export interface AdminPlayer {
  id: string;
  username: string;
  coins: number;
  profit: number;
  total_wagered: number;
  is_admin: boolean;
}

/** Admin override for the next wheel round. null fields = random. */
export interface WheelNext {
  result: WheelTarget | null;
  /** Coinflip (7 or 25) or Bonus (11-99) multiplier. */
  mult: number | null;
  boost_target: WheelTarget | null;
  /** 1 = force "no boost", null = random. */
  boost_mult: number | null;
}

/** Weights for the wheel odds editor. Keys are slot names, values are weights. */
export interface WheelOdds {
  segment: Record<string, number>;
  boost: Record<string, number>;
  coinflip: Record<string, number>;
  crazytime?: Record<string, number>;
}

/** What the `crash_state()` function returns. Times are milliseconds since 1970 (server clock). */
export interface CrashState {
  now: number;
  id: number;
  /** the moment the astronaut launches */
  betting_ends_at: number;
  ends_at: number;
  crashed: boolean;
  /** null until the crash has really happened */
  crash_point: number | null;
  totals: { coins: number; players: number };
  mine: { amount: number; auto: number | null; cashed_mult: number | null; payout: number } | null;
  history: { id: number; crash_point: number }[];
}
