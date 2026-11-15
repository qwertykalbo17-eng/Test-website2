import { useEffect, useMemo, useState } from "react";
import { useCoin } from "../coin";
import type { BattleFormat, BattleMode, CaseDef } from "../types";
import { formatValue, img } from "../utils";
import CaseOdds from "./CaseOdds";
import Modal from "./Modal";

interface Props {
  open: boolean;
  /** Cases that can be bought (active ones). */
  cases: CaseDef[];
  coins: number;
  busy: boolean;
  onClose: () => void;
  onCreate: (caseIds: string[], mode: BattleMode, format: BattleFormat) => void;
}

const FORMATS: { id: BattleFormat; label: string }[] = [
  { id: "1v1", label: "1v1" },
  { id: "1v1v1", label: "1v1v1" },
  { id: "2v2", label: "2v2" },
];

const MAX_CASES = 10;

export default function CreateBattleModal({ open, cases, coins, busy, onClose, onCreate }: Props) {
  const coin = useCoin();
  const [mode, setMode] = useState<BattleMode>("normal");
  const [format, setFormat] = useState<BattleFormat>("1v1");
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setMode("normal");
      setFormat("1v1");
      setPicked([]);
    }
  }, [open]);

  const byId = useMemo(() => new Map(cases.map((c) => [c.id, c])), [cases]);
  const chosen = picked.map((id) => byId.get(id)).filter((c): c is CaseDef => !!c);
  const cost = chosen.reduce((sum, c) => sum + c.price, 0);
  const canAfford = coins >= cost;

  return (
    <Modal open={open} onClose={onClose} title="Create case battle" wide>
      <div className="cbm__options">
        <div>
          <div className="cbm__label">Mode</div>
          <div className="seg">
            <button className={`seg__btn ${mode === "normal" ? "is-active" : ""}`} onClick={() => setMode("normal")}>
              ⚔️ Normal
            </button>
            <button className={`seg__btn ${mode === "crazy" ? "is-active" : ""}`} onClick={() => setMode("crazy")}>
              🤡 Crazy
            </button>
          </div>
          <div className="muted cbm__hint">
            {mode === "normal" ? "The highest total pull wins." : "The LOWEST total pull wins."}
          </div>
        </div>
        <div>
          <div className="cbm__label">Format</div>
          <div className="seg">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                className={`seg__btn ${format === f.id ? "is-active" : ""}`}
                onClick={() => setFormat(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="muted cbm__hint">
            {format === "2v2" ? "Two teams of two, team totals are compared." : "Every player for themselves."}
          </div>
        </div>
      </div>

      <div className="cbm__label">Pick cases (each one is a round, up to {MAX_CASES})</div>
      {cases.length === 0 && <div className="empty">No cases yet. An admin has to create some first.</div>}
      <ul className="cbm__cases">
        {cases.map((c) => {
          const count = picked.filter((id) => id === c.id).length;
          return (
            <li key={c.id} className={`casecard ${count > 0 ? "is-selected" : ""}`}>
              <div className="casecard__img">{c.image ? <img src={img(c.image)} alt={c.name} /> : "📦"}</div>
              <div className="casecard__name" title={c.name}>
                {c.name}
              </div>
              <div className="card__price">
                {coin} {formatValue(c.price)}
              </div>
              <div className="casecard__buttons">
                <button
                  className="btn btn--ghost btn--sm"
                  disabled={count === 0}
                  onClick={() =>
                    setPicked((p) => {
                      const i = p.lastIndexOf(c.id);
                      return i < 0 ? p : [...p.slice(0, i), ...p.slice(i + 1)];
                    })
                  }
                >
                  −
                </button>
                <b>{count}</b>
                <button
                  className="btn btn--primary btn--sm"
                  disabled={picked.length >= MAX_CASES}
                  onClick={() => setPicked((p) => [...p, c.id])}
                >
                  +
                </button>
              </div>
              <CaseOdds c={c} />
            </li>
          );
        })}
      </ul>

      <div className="modal__footer">
        <div className="modal__summary">
          <span className="muted">
            {picked.length} case{picked.length === 1 ? "" : "s"} · each player pays
          </span>
          <b className={canAfford ? "text-accent" : "text-danger"}>
            {coin} {formatValue(cost)}
          </b>
          <span className="muted">(you have {coin} {formatValue(coins)})</span>
        </div>
        <div className="modal__actions">
          <button
            className="btn btn--primary"
            disabled={picked.length === 0 || !canAfford || busy}
            onClick={() => onCreate(picked, mode, format)}
          >
            {picked.length > 0 && !canAfford ? "Not enough coins" : "Create battle"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
