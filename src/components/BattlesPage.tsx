import { useCoin } from "../coin";
import type { CaseBattle } from "../types";
import { formatValue, img } from "../utils";
import { Avatar } from "./parts";

interface Props {
  open: CaseBattle[];
  recent: CaseBattle[];
  userId: string;
  busy: boolean;
  onCreate: () => void;
  onJoin: (battle: CaseBattle, slot: number) => void;
  onAddBots: (battle: CaseBattle) => void;
  onCancel: (battle: CaseBattle) => void;
  onView: (battle: CaseBattle) => void;
}

export const modeLabel = (mode: string) => (mode === "crazy" ? "🤡 Crazy" : "⚔️ Normal");

/** "Team A" / "Team B" for 2v2, otherwise no label. */
export const teamOf = (format: string, slot: number) => (format === "2v2" ? (slot < 2 ? "A" : "B") : null);

function CaseIcons({ cases }: { cases: CaseBattle["cases"] }) {
  const shown = cases.slice(0, 6);
  return (
    <div className="cb__cases">
      {shown.map((c, i) => (
        <span key={i} className="cb__case" title={c.name}>
          {c.image ? <img src={img(c.image)} alt={c.name} /> : "📦"}
        </span>
      ))}
      {cases.length > shown.length && <span className="match__extra">+{cases.length - shown.length}</span>}
    </div>
  );
}

export default function BattlesPage({ open, recent, userId, busy, onCreate, onJoin, onAddBots, onCancel, onView }: Props) {
  const coin = useCoin();

  return (
    <>
      <div className="hero">
        <div>
          <h1>Case Battles</h1>
          <p className="muted">Open cases against other players. Highest total wins, or lowest in Crazy mode.</p>
        </div>
        <div className="hero__actions">
          <button className="btn btn--primary" onClick={onCreate}>
            Create battle
          </button>
        </div>
      </div>

      <section className="panel">
        <div className="panel__head">
          <h2>Open battles</h2>
          <span className="muted">{open.length} open</span>
        </div>

        {open.length === 0 && <div className="empty">No open battles. Press “Create battle” to start one.</div>}

        <ul className="matches">
          {open.map((b) => {
            const mine = b.creator_id === userId;
            const inside = b.players.some((p) => p && p.user_id === userId);
            return (
              <li key={b.id} className="cb">
                <div className="cb__info">
                  <div className="cb__tags">
                    <span className={`tag tag--${b.mode}`}>{modeLabel(b.mode)}</span>
                    <span className="tag">{b.format}</span>
                    <span className="muted">{b.cases.length} case{b.cases.length === 1 ? "" : "s"}</span>
                  </div>
                  <CaseIcons cases={b.cases} />
                </div>

                <div className="cb__slots">
                  {b.players.map((p, slot) => (
                    <div key={slot} className={`cb__slot ${slot === 2 && b.format === "2v2" ? "cb__slot--gap" : ""}`}>
                      {p ? (
                        <>
                          <Avatar name={p.name} bot={p.is_bot} />
                          <span className="cb__slotname" title={p.name}>
                            {p.name}
                          </span>
                        </>
                      ) : (
                        <button
                          className="btn btn--primary btn--sm"
                          disabled={busy || inside}
                          onClick={() => onJoin(b, slot)}
                          title={inside ? "You are already in this battle" : `Join for ${b.cost} coins`}
                        >
                          Join
                        </button>
                      )}
                      {teamOf(b.format, slot) && <span className="cb__team">Team {teamOf(b.format, slot)}</span>}
                    </div>
                  ))}
                </div>

                <div className="cb__actions">
                  <div className="match__total">
                    {coin} {formatValue(b.cost)}
                  </div>
                  <div className="muted">per player</div>
                  {mine && (
                    <div className="cb__buttons">
                      <button className="btn btn--primary btn--sm" disabled={busy} onClick={() => onAddBots(b)}>
                        Add bots
                      </button>
                      <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => onCancel(b)}>
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2>Recent battles</h2>
        </div>
        {recent.length === 0 && <div className="empty">No battles played yet.</div>}
        <ul className="matches">
          {recent.map((b) => {
            const winners = (b.result?.winner_slots ?? []).map((s) => b.players[s]?.name ?? "?");
            return (
              <li key={b.id} className="cb cb--done">
                <div className="cb__info">
                  <div className="cb__tags">
                    <span className={`tag tag--${b.mode}`}>{modeLabel(b.mode)}</span>
                    <span className="tag">{b.format}</span>
                  </div>
                  <CaseIcons cases={b.cases} />
                </div>
                <div className="cb__slots">
                  {b.players.map((p, slot) => (
                    <div
                      key={slot}
                      className={`cb__slot ${slot === 2 && b.format === "2v2" ? "cb__slot--gap" : ""}`}
                    >
                      {p && (
                        <Avatar
                          name={p.name}
                          bot={p.is_bot}
                          state={b.result?.winner_slots.includes(slot) ? "winner" : "loser"}
                        />
                      )}
                    </div>
                  ))}
                </div>
                <div className="cb__actions">
                  <div className="muted">{winners.join(" & ")} won</div>
                  <button className="btn btn--ghost btn--sm" onClick={() => onView(b)}>
                    View
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
