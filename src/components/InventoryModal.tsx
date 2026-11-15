import { useEffect, useMemo, useState } from "react";
import type { InvItem, Match, Side } from "../types";
import { betRange, findItemsInRange, formatValue, img, otherSide, sumValue } from "../utils";
import Modal from "./Modal";

interface Props {
  open: boolean;
  /** Only items that are not locked in another match. */
  inventory: InvItem[];
  /** The match you are joining, or null when you are posting a new one. */
  match: Match | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (items: InvItem[], side: Side) => void;
}

type Sort = "high" | "low" | "az" | "za";

export default function InventoryModal({ open, inventory, match, busy, onClose, onConfirm }: Props) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("high");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [side, setSide] = useState<Side>("Heads");
  const [error, setError] = useState("");

  // When joining, you always get the side the creator did not pick.
  const forcedSide: Side | null = match ? otherSide(match.creator_side) : null;
  const matchId = match?.id ?? null;

  useEffect(() => {
    if (open) {
      setSelected(new Set());
      setSearch("");
      setError("");
      setSide("Heads");
    }
  }, [open, matchId]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = inventory.filter((i) => i.name.toLowerCase().includes(q));
    list.sort((a, b) => {
      switch (sort) {
        case "high":
          return b.value - a.value;
        case "low":
          return a.value - b.value;
        case "az":
          return a.name.localeCompare(b.name);
        case "za":
          return b.name.localeCompare(a.name);
      }
    });
    return list;
  }, [inventory, search, sort]);

  const chosen = inventory.filter((i) => selected.has(i.id));
  const total = sumValue(chosen);
  const range = match ? betRange(match.creator_total) : null;
  const inRange = !range || (total >= range.min && total <= range.max);

  function toggle(id: string) {
    setError("");
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function autoSelect() {
    if (!match) return;
    const found = findItemsInRange(inventory, match.creator_total);
    if (!found) {
      setSelected(new Set());
      setError("None of your item combinations fit this bet range.");
      return;
    }
    setError("");
    setSelected(new Set(found.map((i) => i.id)));
  }

  function confirm() {
    if (chosen.length === 0) return setError("Select at least one item.");
    if (!inRange && range) {
      return setError(`Your bet must be between ${formatValue(range.min)} and ${formatValue(range.max)}.`);
    }
    onConfirm(chosen, forcedSide ?? side);
  }

  return (
    <Modal open={open} onClose={onClose} title={match ? "Join match" : "Post a match"} wide>
      <div className="toolbar">
        <input
          className="input"
          placeholder="Search inventory…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input input--select" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="high">Value: High → Low</option>
          <option value="low">Value: Low → High</option>
          <option value="az">Name: A → Z</option>
          <option value="za">Name: Z → A</option>
        </select>
      </div>

      {match && range && (
        <div className="notice">
          <span>
            <b>{match.creator_name}</b> bet <b>💎 {formatValue(match.creator_total)}</b> on{" "}
            <b>{match.creator_side}</b>. Bet between <b>💎 {formatValue(range.min)}</b> and{" "}
            <b>💎 {formatValue(range.max)}</b> to join.
          </span>
          <button type="button" className="btn btn--primary btn--sm" onClick={autoSelect}>
            Auto select
          </button>
        </div>
      )}

      {inventory.length === 0 ? (
        <div className="empty">
          No available items. Buy some in the Marketplace. Items inside an open match are locked.
        </div>
      ) : (
        <ul className="grid">
          {visible.map((item) => (
            <li
              key={item.id}
              className={`card ${selected.has(item.id) ? "is-selected" : ""}`}
              onClick={() => toggle(item.id)}
            >
              <img src={img(item.image)} alt={item.name} />
              <div className="card__name" title={item.name}>
                {item.name}
              </div>
              <div className="card__value">💎 {formatValue(item.value)}</div>
            </li>
          ))}
        </ul>
      )}

      <div className="modal__footer">
        <div className="side-picker">
          {(["Heads", "Tails"] as Side[]).map((s) => (
            <button
              key={s}
              type="button"
              disabled={!!forcedSide && forcedSide !== s}
              className={`side-btn ${(forcedSide ?? side) === s ? "is-active" : ""}`}
              onClick={() => setSide(s)}
            >
              <img src={img(s === "Heads" ? "heads.webp" : "tails.webp")} alt="" />
              {s}
            </button>
          ))}
        </div>

        <div className="modal__summary">
          <span className="muted">Selected</span>
          <b className={inRange ? "" : "text-danger"}>💎 {formatValue(total)}</b>
        </div>

        <div className="modal__actions">
          <button className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={confirm} disabled={busy}>
            {match ? "Join match" : "Post match"}
          </button>
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}
