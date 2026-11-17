import { useEffect, useRef } from "react";
import type { Match } from "../types";
import { betRange, formatValue, img, otherSide } from "../utils";
import Modal from "./Modal";
import { Avatar, BetColumn } from "./parts";

interface Props {
  /** The live match (kept up to date by the parent). */
  match: Match;
  userId: string;
  busy: boolean;
  onClose: () => void;
  onJoin: (match: Match) => void;
  onCallBot: (match: Match) => void;
  onCancel: (match: Match) => void;
  /** Someone joined while you were watching: go to the flip. */
  onFlip: (match: Match) => void;
}

/** Wait this long after someone joins so you can see their name before the flip starts. */
const FLIP_DELAY_MS = 1800;
const FLIP_WINDOW_MS = 2 * 60 * 1000;

export default function MatchViewModal({ match, userId, busy, onClose, onJoin, onCallBot, onCancel, onFlip }: Props) {
  // only a match that was still open when the window opened moves on to the flip by itself;
  // opening an already finished match (View in the Done list) just shows it
  const openedWhileOpen = useRef(match.status === "open");
  const isOpen = match.status === "open";
  const finished = match.status === "finished";
  const iAmCreator = match.creator_id === userId;
  const iAmJoiner = !!userId && match.joiner_id === userId;

  const joinerSide = otherSide(match.creator_side);
  const joinerName = isOpen ? "Waiting" : (match.joiner_name ?? "Bot");
  const { min, max } = betRange(match.creator_total);

  // The creator is watching and a player joined: show them for a moment, then flip.
  const fresh = finished && Date.now() - new Date(match.finished_at ?? match.created_at).getTime() < FLIP_WINDOW_MS;
  const goesToFlip = openedWhileOpen.current && fresh && (iAmCreator || iAmJoiner);
  useEffect(() => {
    if (!goesToFlip) return;
    const t = setTimeout(() => onFlip(match), FLIP_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goesToFlip, match.id]);

  const winnerName = finished ? (match.winner === "creator" ? match.creator_name : (match.joiner_name ?? "Bot")) : null;

  return (
    <Modal open onClose={onClose} title="Match info" wide>
      <div className="battle matchview">
        <div className="battle__top">
          <div className="fighter">
            <Avatar name={match.creator_name} state={finished ? (match.winner === "creator" ? "winner" : "loser") : undefined} />
            <img
              className="fighter__side"
              src={img(match.creator_side === "Heads" ? "heads.webp" : "tails.webp")}
              alt={match.creator_side}
            />
            <div className="fighter__name">{match.creator_name}</div>
          </div>

          <div className="stage">
            {isOpen && (
              <>
                <p className="stage__text">Waiting for a player…</p>
                <p className="muted" style={{ textAlign: "center", margin: 0 }}>
                  Bets between 💎 {formatValue(min)} and 💎 {formatValue(max)} can join
                </p>
              </>
            )}
            {finished && (
              <>
                <img
                  className="stage__result"
                  src={img(match.flip === "Heads" ? "heads.webp" : "tails.webp")}
                  alt={match.flip ?? ""}
                />
                <p className="stage__text">
                  {goesToFlip ? "Starting the flip…" : `${match.flip} — ${winnerName} won`}
                </p>
              </>
            )}
            {match.status === "cancelled" && <p className="stage__text">This match was cancelled.</p>}
          </div>

          <div className="fighter">
            {isOpen ? <div className="hist-avatar is-waiting">?</div> : <Avatar name={joinerName} bot={match.is_bot} state={finished ? (match.winner === "joiner" ? "winner" : "loser") : undefined} />}
            <img
              className="fighter__side"
              src={img(joinerSide === "Heads" ? "heads.webp" : "tails.webp")}
              alt={joinerSide}
            />
            <div className={`fighter__name ${isOpen ? "muted" : ""}`}>{joinerName}</div>
          </div>
        </div>

        <div className="battle__hash"># {match.id}</div>

        <div className="battle__cols">
          <BetColumn title={`${match.creator_name}'s bet`} items={match.creator_items} />
          <BetColumn title={isOpen ? "Waiting for a player" : `${joinerName}'s bet`} items={match.joiner_items ?? []} />
        </div>

        <div className="battle__footer">
          {isOpen && iAmCreator && (
            <>
              <button className="btn btn--primary" disabled={busy} onClick={() => onCallBot(match)}>
                Call Bot
              </button>
              <button className="btn btn--ghost" disabled={busy} onClick={() => onCancel(match)}>
                Cancel match
              </button>
            </>
          )}
          {isOpen && !iAmCreator && (
            <button className="btn btn--primary" disabled={busy} onClick={() => onJoin(match)}>
              Join
            </button>
          )}
          {!isOpen && !goesToFlip && (
            <button className="btn btn--primary" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
