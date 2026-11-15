import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import type { LeaderboardEntry } from "../types";
import { formatValue } from "../utils";

const medals = ["🥇", "🥈", "🥉"];

interface Props {
  /** The logged-in player's own numbers, shown under the top 10. */
  me?: { username: string; profit: number; totalWagered: number } | null;
}

export default function Leaderboard({ me }: Props) {
  const [players, setPlayers] = useState<LeaderboardEntry[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("leaderboard")
      .select("username, profit, total_wagered")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("Leaderboard error:", error);
          setError("Couldn't load the leaderboard.");
          return;
        }
        setPlayers(
          (data ?? []).map((r: any) => ({
            username: r.username || "Player",
            totalWagered: Number(r.total_wagered) || 0,
            profit: Number(r.profit) || 0,
          }))
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="panel">
      <div className="panel__head">
        <h2>🏆 Leaderboard</h2>
        <span className="muted">Top 10 by profit</span>
      </div>

      {error && <div className="empty">{error}</div>}
      {!error && players === null && <div className="empty">Loading…</div>}
      {players && players.length === 0 && <div className="empty">No players yet.</div>}

      {players && players.length > 0 && (
        <div className="table">
          <div className="table__row table__row--head">
            <div>Rank</div>
            <div>Username</div>
            <div>Total wagered</div>
            <div>Profit</div>
          </div>
          {players.map((p, i) => (
            <div key={i} className="table__row">
              <div className="table__rank">{medals[i] ?? i + 1}</div>
              <div className="table__user">{p.username}</div>
              <div className="text-accent">💎 {formatValue(p.totalWagered)}</div>
              <div className={p.profit >= 0 ? "text-win" : "text-danger"}>
                {p.profit < 0 ? "-" : ""}
                {formatValue(Math.abs(p.profit))}
              </div>
            </div>
          ))}

          {me && (
            <div className="table__row table__row--me">
              <div className="table__rank">You</div>
              <div className="table__user">
                {me.username} <span className="tag">Your profit</span>
              </div>
              <div className="text-accent">💎 {formatValue(me.totalWagered)}</div>
              <div className={me.profit >= 0 ? "text-win" : "text-danger"}>
                {me.profit < 0 ? "-" : ""}
                {formatValue(Math.abs(me.profit))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
