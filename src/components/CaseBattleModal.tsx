import { useEffect, useState, type CSSProperties } from "react";
import type { CaseBattle } from "../types";
import { formatValue, img } from "../utils";
import { modeLabel, teamOf } from "./BattlesPage";
import Modal from "./Modal";
import { Avatar } from "./parts";

interface Props {
  battle: CaseBattle;
  userId: string;
  /** true: reveal the rounds one by one. false: show everything at once (history). */
  animate: boolean;
  onClose: () => void;
}

const ROUND_MS = 1500;

export default function CaseBattleModal({ battle, userId, animate, onClose }: Props) {
  const result = battle.result;
  const rounds = result?.rounds ?? [];
  const [shown, setShown] = useState(animate ? 0 : rounds.length);

  useEffect(() => {
    if (!animate || shown >= rounds.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 700 : ROUND_MS);
    return () => clearTimeout(t);
  }, [animate, shown, rounds.length]);

  if (!result) return null;

  const done = shown >= rounds.length;
  const totals = battle.players.map((_, slot) =>
    rounds.slice(0, shown).reduce((sum, round) => sum + (round[slot]?.value ?? 0), 0)
  );

  const mySlot = battle.players.findIndex((p) => p && p.user_id === userId);
  const iWon = mySlot >= 0 && result.winner_slots.includes(mySlot);
  const winnerNames = result.winner_slots.map((s) => battle.players[s]?.name ?? "?").join(" & ");

  return (
    <Modal open onClose={onClose} title={`Case battle · ${modeLabel(battle.mode)} · ${battle.format}`} wide>
      <div className="cbv" style={{ "--cols": battle.slots } as CSSProperties}>
        {/* player header */}
        <div className="cbv__row cbv__row--head">
          {battle.players.map((p, slot) => {
            const winner = done && result.winner_slots.includes(slot);
            return (
              <div key={slot} className={`cbv__player ${winner ? "is-winner" : ""} ${done && !winner ? "is-loser" : ""}`}>
                <Avatar name={p?.name ?? "?"} bot={p?.is_bot} state={done ? (winner ? "winner" : "loser") : undefined} />
                <div className="cbv__name" title={p?.name}>
                  {p?.name}
                  {p && p.user_id === userId && <span className="tag">You</span>}
                </div>
                {teamOf(battle.format, slot) && <div className="muted">Team {teamOf(battle.format, slot)}</div>}
                <div className="cbv__total">💎 {formatValue(totals[slot])}</div>
              </div>
            );
          })}
        </div>

        {/* one row per round */}
        {rounds.map((round, r) => (
          <div key={r} className="cbv__row">
            {round.map((item, slot) =>
              r < shown ? (
                <div key={slot} className="cbv__pull">
                  <img src={img(item.image)} alt={item.name} />
                  <div className="cbv__item" title={item.name}>
                    {item.name}
                  </div>
                  <b>💎 {formatValue(item.value)}</b>
                </div>
              ) : (
                <div key={slot} className="cbv__pull cbv__pull--hidden">
                  <div className="cbv__box">{r === shown ? "🎁" : "📦"}</div>
                  <div className="muted">{battle.cases[r]?.name}</div>
                </div>
              )
            )}
          </div>
        ))}
      </div>

      {done ? (
        <div className="cbv__result">
          <p className={`stage__text stage__text--big ${mySlot < 0 ? "" : iWon ? "text-win" : "text-danger"}`}>
            {mySlot < 0 ? `${winnerNames} won` : iWon ? "You won!" : "You lost"}
          </p>
          <p className="muted">
            {battle.mode === "crazy" ? "Lowest total wins." : "Highest total wins."} {winnerNames} won all{" "}
            {result.items_won} items.
            {battle.format === "2v2" && ` Team totals: A 💎 ${formatValue(result.team_totals[0])}, B 💎 ${formatValue(result.team_totals[1])}.`}
          </p>
        </div>
      ) : (
        <div className="cbv__result">
          <button className="btn btn--ghost btn--sm" onClick={() => setShown(rounds.length)}>
            Skip
          </button>
        </div>
      )}
    </Modal>
  );
}
