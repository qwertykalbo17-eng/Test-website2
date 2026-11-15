import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import type { Match } from "../types";
import { betRange, formatValue, img } from "../utils";
import Modal from "./Modal";
import { Avatar, BetColumn } from "./parts";

interface Props {
  open: boolean;
  userId: string;
  onClose: () => void;
}

export default function HistoryModal({ open, userId, onClose }: Props) {
  const [rows, setRows] = useState<Match[] | null>(null);
  const [viewing, setViewing] = useState<Match | null>(null);

  useEffect(() => {
    if (!open) {
      setViewing(null);
      return;
    }
    let cancelled = false;
    setRows(null);

    supabase
      .from("matches")
      .select("*")
      .eq("status", "finished")
      .or(`creator_id.eq.${userId},joiner_id.eq.${userId}`)
      .order("finished_at", { ascending: false })
      .limit(10)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error("Error loading history:", error);
        setRows(error ? [] : (data as Match[]));
      });

    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  return (
    <Modal open={open} onClose={onClose} title={viewing ? "Match details" : "Your history"} wide>
      {viewing ? (
        <Details match={viewing} userId={userId} onBack={() => setViewing(null)} />
      ) : rows === null ? (
        <div className="empty">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="empty">No games yet. Play a coinflip and it will show up here.</div>
      ) : (
        <ul className="hist-list">
          {rows.map((m) => {
            const joinerName = m.joiner_name ?? "Bot";
            const joinerItems = m.joiner_items ?? [];
            const pot = [...m.creator_items, ...joinerItems];
            const { min, max } = betRange(m.creator_total);

            return (
              <li key={m.id} className="hist">
                {/* left = creator, right = whoever joined (a player, or the bot) */}
                <div className="hist__players">
                  <Avatar name={m.creator_name} state={m.winner === "creator" ? "winner" : "loser"} />
                  <Avatar
                    name={joinerName}
                    bot={m.is_bot}
                    state={m.winner === "joiner" ? "winner" : "loser"}
                  />
                </div>

                <div className="hist__items">
                  {pot.slice(0, 6).map((item, i) => (
                    <img key={i} src={img(item.image)} alt={item.name} title={item.name} />
                  ))}
                  {pot.length > 6 && <span className="muted">+{pot.length - 6}</span>}
                </div>

                <img
                  className="coin"
                  src={img(m.flip === "Heads" ? "heads.webp" : "tails.webp")}
                  alt={m.flip ?? ""}
                  title={m.flip ?? ""}
                />

                <div className="hist__value">
                  <div className="hist__total">💎 {formatValue(m.creator_total + (m.joiner_total ?? 0))}</div>
                  <div className="muted">
                    {formatValue(min)} – {formatValue(max)}
                  </div>
                </div>

                <button className="btn btn--ghost btn--sm" onClick={() => setViewing(m)}>
                  View
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

function Details({ match, userId, onBack }: { match: Match; userId: string; onBack: () => void }) {
  const joinerName = match.joiner_name ?? "Bot";
  const iAmCreator = match.creator_id === userId;
  const won = iAmCreator ? match.winner === "creator" : match.winner === "joiner";

  return (
    <div>
      <button className="btn btn--ghost btn--sm" onClick={onBack}>
        ← Back
      </button>
      <p className={`stage__text stage__text--big ${won ? "text-win" : "text-danger"}`}>
        {match.flip} — {won ? "You won" : "You lost"}
      </p>
      <p className="muted" style={{ textAlign: "center", marginTop: 0 }}>
        {match.finished_at ? new Date(match.finished_at).toLocaleString() : ""}
      </p>
      {match.tax_total > 0 && (
        <p className="muted" style={{ textAlign: "center", marginTop: 0 }}>
          House tax: 💎 {formatValue(match.tax_total)} (
          {match.tax_items.map((t) => t.name).join(", ")})
        </p>
      )}
      <div className="battle__cols">
        <BetColumn title={`${match.creator_name}'s bet`} items={match.creator_items} />
        <BetColumn title={`${joinerName}'s bet`} items={match.joiner_items ?? []} />
      </div>
    </div>
  );
}
