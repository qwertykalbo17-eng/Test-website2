import { useEffect, useState } from "react";
import type { Match } from "../types";
import { betRange, formatValue, img, otherSide } from "../utils";
import { Avatar } from "./parts";

interface Props {
  open: Match[];
  recent: Match[];
  /** Heads / Tails results among the last 100 flips. */
  counts: { heads: number; tails: number };
  userId: string;
  busy: boolean;
  onJoin: (match: Match) => void;
  onCallBot: (match: Match) => void;
  onView: (match: Match) => void;
}

const DONE_VISIBLE_MS = 2 * 60 * 1000;
const MAX_DONE = 15;

export default function MatchList({ open, recent, counts, userId, busy, onJoin, onCallBot, onView }: Props) {
  const MAX_VISIBLE_ITEMS = 3;

  // Finished matches stay in the list for 2 minutes (max 15, newest first).
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);
  const done = recent
    .filter((m) => now - new Date(m.finished_at ?? m.created_at).getTime() < DONE_VISIBLE_MS)
    .slice(0, MAX_DONE);

  return (
    <>
      <section className="panel">
        <div className="panel__head">
          <h2>Recent results</h2>
        </div>
        <div className="recent">
          {recent.length === 0 && <span className="muted">No flips yet.</span>}
          {recent.map((m) => (
            <img
              key={m.id}
              src={img(m.flip === "Heads" ? "heads.webp" : "tails.webp")}
              alt={m.flip ?? ""}
              title={`${m.flip} — ${m.winner === "creator" ? m.creator_name : (m.joiner_name ?? "Bot")} won`}
            />
          ))}
        </div>
        {/* phones: a short Heads / Tails counter instead of the row of coins */}
        <div className="recent-summary" aria-label="Last 100 flips">
          <span className="recent-summary__item is-heads">
            <img src={img("heads.webp")} alt="Heads" />
            <b>{counts.heads}</b>
          </span>

          <span className="recent-summary__item is-tails">
            <img src={img("tails.webp")} alt="Tails" />
            <b>{counts.tails}</b>
          </span>
        </div>
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2>Open matches</h2>
          <span className="muted">{open.length} open</span>
        </div>

        {open.length === 0 && done.length === 0 && <div className="empty">No open matches. Press “Post match” to create one.</div>}

        <ul className="matches">
          {open.map((m) => {
            const mine = m.creator_id === userId;
            const { min, max } = betRange(m.creator_total);

            // Sort items from highest value to lowest value
            const sortedItems = [...m.creator_items].sort((a, b) => b.value - a.value);

            const visibleItems = sortedItems.slice(0, MAX_VISIBLE_ITEMS);
            const extraItems = sortedItems.length - MAX_VISIBLE_ITEMS;

            return (
              <li key={m.id} className="match">
                <div className="match__creator">
                  <Avatar name={m.creator_name} />
                  <div className="match__name" title={m.creator_name}>
                    {m.creator_name}
                    {mine && <span className="tag">You</span>}
                  </div>
                </div>

                <div className="match__items">
                  {visibleItems.map((item, i) => (
                    <img
                      key={i}
                      src={img(item.image)}
                      alt={item.name}
                      title={`${item.name} - 💎 ${formatValue(item.value)}`}
                    />
                  ))}

                  {extraItems > 0 && <div className="match__extra">+{extraItems}</div>}
                </div>

                <div className="match__value">
                  <div className="match__total">💎 {formatValue(m.creator_total)}</div>
                  <div className="muted">
                    {formatValue(min)} – {formatValue(max)}
                  </div>
                </div>

                <div className="match__action">
                  <img
                    className="coin"
                    src={img(m.creator_side === "Heads" ? "heads.webp" : "tails.webp")}
                    alt={m.creator_side}
                    title={
                      mine
                        ? `You picked ${m.creator_side}`
                        : `${m.creator_name} picked ${m.creator_side}, you would get ${otherSide(m.creator_side)}`
                    }
                  />
                  <div className="match__buttons">
                    {mine ? (
                      <button className="btn btn--primary" disabled={busy} onClick={() => onCallBot(m)}>
                        Call Bot
                      </button>
                    ) : (
                      <button className="btn btn--primary" disabled={busy} onClick={() => onJoin(m)}>
                        Join
                      </button>
                    )}
                    <button className="btn btn--ghost" onClick={() => onView(m)}>
                      View
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
          {done.map((m) => {
            const joinerName = m.joiner_name ?? "Bot";
            const winnerName = m.winner === "creator" ? m.creator_name : joinerName;
            const pot = [...m.creator_items, ...(m.joiner_items ?? [])].sort((a, b) => b.value - a.value);
            const shown = pot.slice(0, MAX_VISIBLE_ITEMS);
            const extra = pot.length - MAX_VISIBLE_ITEMS;
            return (
              <li key={m.id} className="match match--done">
                <div className="match__creator">
                  <Avatar name={m.creator_name} state={m.winner === "creator" ? "winner" : "loser"} />
                  <span className="match__vs">vs</span>
                  <Avatar name={joinerName} bot={m.is_bot} state={m.winner === "joiner" ? "winner" : "loser"} />
                </div>
                <div className="match__items">
                  {shown.map((item, i) => (
                    <img key={i} src={img(item.image)} alt={item.name} title={`${item.name} - 💎 ${formatValue(item.value)}`} />
                  ))}
                  {extra > 0 && <div className="match__extra">+{extra}</div>}
                </div>
                <div className="match__value">
                  <div className="match__total">💎 {formatValue(m.creator_total + (m.joiner_total ?? 0))}</div>
                  <div className="muted">{winnerName} won</div>
                </div>
                <div className="match__action">
                  <img className="coin" src={img(m.flip === "Heads" ? "heads.webp" : "tails.webp")} alt={m.flip ?? ""} title={m.flip ?? ""} />
                  <div className="match__buttons">
                    <span className="tag">Done</span>
                    <button className="btn btn--ghost" onClick={() => onView(m)}>
                      View
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
