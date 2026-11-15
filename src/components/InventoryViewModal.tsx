import { useMemo, useState } from "react";
import type { InvItem } from "../types";
import { formatValue, img, sumValue } from "../utils";
import Modal from "./Modal";

interface Props {
  open: boolean;
  inventory: InvItem[];
  onClose: () => void;
}

export default function InventoryViewModal({ open, inventory, onClose }: Props) {
  const [search, setSearch] = useState("");

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inventory
      .filter((i) => i.name.toLowerCase().includes(q))
      .sort((a, b) => b.value - a.value);
  }, [inventory, search]);

  const lockedCount = inventory.filter((i) => i.locked).length;

  return (
    <Modal open={open} onClose={onClose} title="Your inventory" wide>
      <div className="toolbar">
        <input
          className="input"
          placeholder="Search inventory…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {inventory.length === 0 ? (
        <div className="empty">Your inventory is empty. Buy items in the Marketplace.</div>
      ) : (
        <ul className="grid">
          {visible.map((item) => (
            <li
              key={item.id}
              className={`card card--static ${item.locked ? "is-locked" : ""}`}
              title={item.locked ? "In an open match" : undefined}
            >
              <img src={img(item.image)} alt={item.name} />
              <div className="card__name" title={item.name}>
                {item.name}
              </div>
              <div className="card__value">💎 {formatValue(item.value)}</div>
              {item.locked && <div className="tag">In match</div>}
            </li>
          ))}
        </ul>
      )}

      <div className="modal__footer">
        <span className="muted">
          {inventory.length} items{lockedCount > 0 ? ` (${lockedCount} in open matches)` : ""}
        </span>
        <div className="modal__summary">
          <span className="muted">Total value</span>
          <b>💎 {formatValue(sumValue(inventory))}</b>
        </div>
      </div>
    </Modal>
  );
}
