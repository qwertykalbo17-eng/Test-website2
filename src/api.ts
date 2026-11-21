import { supabase } from "./supabase";
import type { AdminPlayer, CrashState, CrazyArrowColor, Match, Side, WheelState, WheelTarget } from "./types";

/** Calls a database function. Errors carry the readable message the function raised. */
async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

/** Post a match. Your items are locked until it is played or cancelled. */
export const createMatch = (itemIds: string[], side: Side) =>
  rpc<Match>("create_match", { p_item_ids: itemIds, p_side: side });

/** Cancel your own open match and get the items back. */
export const cancelMatch = (matchId: string) => rpc<Match>("cancel_match", { p_match_id: matchId });

/** Join someone else's match. The database flips the coin and moves the items. */
export const joinMatch = (matchId: string, itemIds: string[]) =>
  rpc<Match>("join_match", { p_match_id: matchId, p_item_ids: itemIds });

/** Creator calls the bot. */
export const callBot = (matchId: string, botItemNames: string[]) =>
  rpc<Match>("call_bot", { p_match_id: matchId, p_bot_items: botItemNames });

/** Tell the database the flip animation was watched, so it is not replayed. */
export const markSeen = (matchId: string) => rpc<void>("mark_seen", { p_match_id: matchId });

/** Buy catalog items with coins. Returns your new coin balance. */
export const buyItems = (names: string[]) => rpc<number>("buy_items", { p_names: names });

/** Sell inventory items for coins. Returns your new coin balance. */
export const sellItems = (itemIds: string[]) => rpc<number>("sell_items", { p_item_ids: itemIds });

// ---- Wheel ----

/** Current wheel round: times, totals, your bets, and the result once betting has closed. */
export const wheelState = () => rpc<WheelState>("wheel_state", {});

/** Bet coins on one segment of the current round. Returns your new coin balance. */
export const wheelBet = (roundId: number, target: WheelTarget, amount: number) =>
  rpc<number>("wheel_bet", { p_round: roundId, p_target: target, p_amount: amount });

/** Save the Red / Green / Blue arrow you picked for Crazy Time in this round. */
export const wheelSetArrow = (roundId: number, arrow: CrazyArrowColor) =>
  rpc<void>("wheel_set_arrow", { p_round: roundId, p_arrow: arrow });

/** Pick one of the 9 Cash Hunt boxes (1-9). You can change it until the pick window closes. */
export const wheelHuntPick = (roundId: number, box: number) =>
  rpc<void>("wheel_hunt_pick", { p_round: roundId, p_box: box });

// ---- Crash ----

/** Current crash round: times, totals, your bet, and the crash point once it has crashed. */
export const crashState = () => rpc<CrashState>("crash_state", {});

/** Bet coins on the current round (betting phase only). Returns your new coin balance. */
export const crashBet = (roundId: number, amount: number, autoCashout: number | null) =>
  rpc<number>("crash_bet", { p_round: roundId, p_amount: amount, p_auto: autoCashout });

/** Cash out at the server's current multiplier. Returns your new coin balance. */
export const crashCashout = (roundId: number) => rpc<number>("crash_cashout", { p_round: roundId });

// ---- Admin ----

export const adminListPlayers = () => rpc<AdminPlayer[]>("admin_list_players", {});

export const adminGiveCoins = (userId: string, amount: number) =>
  rpc<number>("admin_give_coins", { p_user: userId, p_amount: amount });

/** Set how many of an item the marketplace has in stock. */
export const adminSetStock = (name: string, stock: number) =>
  rpc<void>("admin_set_stock", { p_name: name, p_stock: stock });

export interface ItemInfoInput {
  name: string;
  value: number;
  demand: number | null;
  rarity: number | null;
  stability: string | null;
  range: string;
}

/** Edit an item's value and value-list info. */
export const adminUpdateItem = (i: ItemInfoInput) =>
  rpc<void>("admin_update_item", {
    p_name: i.name,
    p_value: i.value,
    p_demand: i.demand,
    p_rarity: i.rarity,
    p_stability: i.stability,
    p_range: i.range,
  });

export interface WheelNext {
  result: WheelTarget | null;
  mult: number | null;
  boost_target: WheelTarget | null;
  boost_mult: number | null;
}

/** What is queued for the next wheel round (null = random). */
export const adminWheelGetNext = () => rpc<WheelNext>("admin_wheel_get_next", {});

/** Fix the next round's result and / or boost. Used once. All null = random. */
export const adminWheelSetNext = (n: WheelNext) =>
  rpc<void>("admin_wheel_set_next", {
    p_result: n.result,
    p_mult: n.mult,
    p_boost_target: n.boost_target,
    p_boost_mult: n.boost_mult,
  });

export type WheelOdds = {
  segment: Record<string, number>;
  boost: Record<string, number>;
  coinflip: Record<string, number>;
  crazytime?: Record<string, number>;
};

/** Current wheel odds (relative weights). */
export const adminWheelGetOdds = () => rpc<WheelOdds>("admin_wheel_get_odds", {});

/** Save new odds, or pass null to reset to the defaults. */
export const adminWheelSetOdds = (odds: WheelOdds | null) => rpc<void>("admin_wheel_set_odds", { p_odds: odds });
/** Crash points queued for the next rounds, in order (empty = random). */
export const adminCrashGetQueue = () => rpc<number[]>("admin_crash_get_queue", {});

/** Replace the queue (max 5 crash points, 1.00 to 15000). Pass [] to clear. */
export const adminCrashSetQueue = (points: number[]) => rpc<void>("admin_crash_set_queue", { p_points: points });
export interface CashHuntRow {
  mult: number;
  weight: number;
}

/** The pool of multipliers the 9 Cash Hunt boxes are drawn from. */
export const adminCashHuntGet = () => rpc<CashHuntRow[]>("admin_cashhunt_get", {});

/** Replace the pool (max 40 rows, unique multipliers, at least one weight above 0). */
export const adminCashHuntSet = (rows: CashHuntRow[]) => rpc<void>("admin_cashhunt_set", { p_rows: rows });
