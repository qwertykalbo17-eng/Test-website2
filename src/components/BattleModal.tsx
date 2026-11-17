import { useEffect, useRef, useState } from "react";
import type { Match } from "../types";
import { formatValue, img, otherSide } from "../utils";
import Modal from "./Modal";
import { Avatar, BetColumn } from "./parts";

interface Props {
  /** A finished match. The result is already decided and saved: this only plays the animation. */
  match: Match;
  userId: string;
  onFinish: () => void;
}

const HEADS_VIDEO = "/XRecorder_20251107_052.mp4";
const TAILS_VIDEO = "/XRecorder_20251107_062.mp4";
const MAX_FLIP_MS = 8000;

export default function BattleModal({ match, userId, onFinish }: Props) {
  const [done, setDone] = useState(false);
  const finished = useRef(false);

  function finishFlip() {
    if (finished.current) return;
    finished.current = true;
    setDone(true);
  }

  // Guarantee the flip ends even if the video fails to load or play.
  useEffect(() => {
    const timer = setTimeout(finishFlip, MAX_FLIP_MS);
    return () => clearTimeout(timer);
  }, []);

  const flip = match.flip ?? "Heads";
  const creatorSide = match.creator_side;
  const joinerSide = otherSide(creatorSide);
  const joinerName = match.joiner_name ?? "Bot";
  const iAmCreator = match.creator_id === userId;
  const won = iAmCreator ? match.winner === "creator" : match.winner === "joiner";

  return (
    <Modal open onClose={onFinish} locked={!done} wide>
      <div className="battle matchview">
        <div className="battle__top">
          <div className="fighter">
            <Avatar name={match.creator_name} />
            <img
              className="fighter__side"
              src={img(creatorSide === "Heads" ? "heads.webp" : "tails.webp")}
              alt={creatorSide}
            />
            <div className="fighter__name">{match.creator_name}</div>
          </div>

          <div className="stage">
            {!done ? (
              <>
                <p className="stage__text">Flipping…</p>
                <video
                  className="stage__video"
                  src={flip === "Heads" ? HEADS_VIDEO : TAILS_VIDEO}
                  autoPlay
                  muted
                  playsInline
                  onEnded={finishFlip}
                  onError={() => setTimeout(finishFlip, 1500)}
                />
              </>
            ) : (
              <>
                <img
                  className="stage__result"
                  src={img(flip === "Heads" ? "heads.webp" : "tails.webp")}
                  alt={flip}
                />
                <p className={`stage__text stage__text--big ${won ? "text-win" : "text-danger"}`}>
                  {flip} — {won ? "You won!" : "You lost"}
                </p>
                {won && match.tax_total > 0 && (
                  <p className="muted" style={{ textAlign: "center", margin: 0 }}>
                    House tax: 💎 {formatValue(match.tax_total)} (
                    {match.tax_items.map((t) => t.name).join(", ")})
                  </p>
                )}
              </>
            )}
          </div>

          <div className="fighter">
            <Avatar name={joinerName} bot={match.is_bot} />
            <img
              className="fighter__side"
              src={img(joinerSide === "Heads" ? "heads.webp" : "tails.webp")}
              alt={joinerSide}
            />
            <div className="fighter__name">{joinerName}</div>
          </div>
        </div>

        <div className="battle__hash"># {match.id}</div>

        <div className="battle__cols">
          <BetColumn title={`${match.creator_name}'s bet`} items={match.creator_items} />
          <BetColumn title={`${joinerName}'s bet`} items={match.joiner_items ?? []} />
        </div>

        {done && (
          <div className="battle__footer">
            <button className="btn btn--primary" onClick={onFinish}>
              Continue
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
