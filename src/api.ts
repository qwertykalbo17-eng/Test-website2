import { supabase } from "./supabase";
import type {
  AdminPlayer,
  CrazyArrowColor,
  Match,
  MatchView,
  Profile,
  ValueItem,
  WheelNext,
  WheelOdds,
  WheelState,
  WheelTarget,
} from "./types";

// AdminPage imports these from "../api"
export type { WheelNext, WheelOdds };

export async function myProfile(): Promise<Profile | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .single();
  if (error) throw new Error(error.message);
  return data as Profile;
}

export async function loginWithUsername(username: string, password: string) {
  const clean = username.trim().toLowerCase();
  const { error } = await supabase.auth.signInWithPassword({
    email: `${clean}@bloxybet.local`,
    password,
  });
  if (error) throw new Error("Wrong username or password");
}

export async function registerWithUsername(username: string, password: string) {
  const clean = username.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(clean)) {
    throw new Error("Username: 3-20 letters, numbers or _");
  }
  const { error } = await supabase.auth.signUp({
    email: `${clean}@bloxybet.local`,
    password,
    options: { data: { username: username.trim() } },
  });
  if (error) throw new Error(error.message);
}

export async function logout() {
  await supabase.auth.signOut();
}

export async function listMatches(): Promise<Match[]> {
  const { data, error } = await supabase.rpc("list_matches");
  if (error) throw new Error(error.message);
  return (data ?? []) as Match[];
}

export async function getMatchView(matchId: number): Promise<MatchView> {
  const { data, error } = await supabase.rpc("get_match_view", { p_match_id: matchId });
  if (error) throw new Error(error.message);
  return data as MatchView;
}

export async function listValues(): Promise<ValueItem[]> {
  const { data, error } = await supabase
    .from("value_items")
    .select("*")
    .order("value", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ValueItem[];
}

export async function createMatch(itemIds: string[], side: "heads" | "tails"): Promise<number> {
  const { data, error } = await supabase.rpc("create_match", { p_item_ids: itemIds, p_side: side });
  if (error) throw new Error(error.message);
  return data as number;
}

export async function joinMatch(matchId: number, itemIds: string[]) {
  const { data, error } = await supabase.rpc("join_match", { p_match_id: matchId, p_item_ids: itemIds });
  if (error) throw new Error(error.message);
  return data as { winner_id: string; result_side: "heads" | "tails" };
}

export async function cancelMatch(matchId: number) {
  const { error } = await supabase.rpc("cancel_match", { p_match_id: matchId });
  if (error) throw new Error(error.message);
}

export async function joinWithBots(matchId: number) {
  const { data, error } = await supabase.rpc("join_with_bots", { p_match_id: matchId });
  if (error) throw new Error(error.message);
  return data as { winner_id: string; result_side: "heads" | "tails" };
}

export async function wheelState(): Promise<WheelState> {
  const { data, error } = await supabase.rpc("wheel_state");
  if (error) throw new Error(error.message);
  return data as WheelState;
}

export async function wheelBet(roundId: number, target: WheelTarget, amount: number): Promise<void> {
  const { error } = await supabase.rpc("wheel_bet", {
    p_round_id: roundId,
    p_target: target,
    p_amount: amount,
  });
  if (error) throw new Error(error.message);
}

export async function wheelSetArrow(roundId: number, arrow: CrazyArrowColor): Promise<void> {
  const { error } = await supabase.rpc("wheel_set_arrow", {
    p_round_id: roundId,
    p_arrow: arrow,
  });
  if (error) throw new Error(error.message);
}

/* ---------- admin ---------- */
// NOTE: the RPC names and p_* parameter names below are inferred from how
// AdminPage uses them. Rename to match your SQL functions if they differ.

export async function adminListPlayers(): Promise<AdminPlayer[]> {
  const { data, error } = await supabase.rpc("admin_list_players");
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminPlayer[];
}

/** Adds (positive) or removes (negative) coins. Resolves to the new balance. */
export async function adminGiveCoins(playerId: string, amount: number): Promise<number> {
  const { data, error } = await supabase.rpc("admin_give_coins", {
    p_user_id: playerId,
    p_amount: amount,
  });
  if (error) throw new Error(error.message);
  return Number(data);
}

export async function adminSetStock(itemName: string, stock: number): Promise<void> {
  const { error } = await supabase.rpc("admin_set_stock", {
    p_name: itemName,
    p_stock: stock,
  });
  if (error) throw new Error(error.message);
}

export async function adminWheelGetNext(): Promise<WheelNext> {
  const { data, error } = await supabase.rpc("admin_wheel_get_next");
  if (error) throw new Error(error.message);
  return (data ?? { result: null, mult: null, boost_target: null, boost_mult: null }) as WheelNext;
}

export async function adminWheelSetNext(next: WheelNext): Promise<void> {
  const { error } = await supabase.rpc("admin_wheel_set_next", {
    p_result: next.result,
    p_mult: next.mult,
    p_boost_target: next.boost_target,
    p_boost_mult: next.boost_mult,
  });
  if (error) throw new Error(error.message);
}

export async function adminWheelGetOdds(): Promise<WheelOdds> {
  const { data, error } = await supabase.rpc("admin_wheel_get_odds");
  if (error) throw new Error(error.message);
  return data as WheelOdds;
}

/** Pass null to reset to the built-in defaults. */
export async function adminWheelSetOdds(odds: WheelOdds | null): Promise<void> {
  const { error } = await supabase.rpc("admin_wheel_set_odds", { p_odds: odds });
  if (error) throw new Error(error.message);
}