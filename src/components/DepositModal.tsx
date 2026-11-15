import { useEffect, useState } from "react";
import type { Item } from "../types";
import { formatValue, img } from "../utils";
import Modal from "./Modal";

interface Props {
  open: boolean;
  /** The item catalog from the database. */
  items: Item[];
  busy: boolean;
  onClose: () => void;
  onAdd: (item: Item, quantity: number) => void;
}

export default function DepositModal({ open, items, busy, onClose, onAdd }: Props) {
  const [selected, setSelected] = useState<Item | null>(null);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (open) {
      setSelected(null);
      setQuantity(1);
    }
  }, [open]);

  function add() {
    if (!selected || !Number.isFinite(quantity) || quantity < 1) return;
    onAdd(selected, Math.min(Math.floor(quantity), 100));
  }

  return (
    <Modal open={open} onClose={onClose} title="Deposit items" wide>
      {items.length === 0 && <div className="empty">No items found. Check the items table in Supabase.</div>}

      <ul className="grid">
        {items.map((item) => (
          <li
            key={item.name}
            className={`card ${selected?.name === item.name ? "is-selected" : ""}`}
            onClick={() => setSelected(item)}
          >
            <img src={img(item.image)} alt={item.name} />
            <div className="card__name" title={item.name}>
              {item.name}
            </div>
            <div className="card__value">💎 {formatValue(item.value)}</div>
          </li>
        ))}
      </ul>

      <div className="modal__footer">
        <div className="modal__summary">
          {selected ? (
            <b>
              {selected.name} · 💎 {formatValue(selected.value)}
            </b>
          ) : (
            <span className="muted">Select an item to deposit</span>
          )}
        </div>
        <div className="modal__actions">
          <input
            className="input input--qty"
            type="number"
            min={1}
            max={100}
            value={Number.isFinite(quantity) ? quantity : ""}
            onChange={(e) => setQuantity(parseInt(e.target.value, 10))}
            disabled={!selected}
          />
          <button className="btn btn--primary" onClick={add} disabled={!selected || busy}>
            Add to inventory
          </button>
        </div>
      </div>
    </Modal>
  );
}
