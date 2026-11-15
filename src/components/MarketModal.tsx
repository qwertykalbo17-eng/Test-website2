import { useEffect, useMemo, useState } from "react";
import type { InvItem, Item } from "../types";
import { buyCoins, formatValue, img, sellCoins, sumValue } from "../utils";
import Modal from "./Modal";

interface Props {
  open: boolean;
  /** The item catalog from the database. */
  catalog: Item[];
  /** Your items that are not locked inside an open match. */
  inventory: InvItem[];
  coins: number;
  /** Currency icon for the active theme. */
  coinIcon: string;
  busy: boolean;
  onClose: () => void;
  onBuy: (item: Item, quantity: number) => void;
  onSell: (items: InvItem[]) => void;
}

export default function MarketModal({ open, catalog, inventory, coins, coinIcon, busy, onClose, onBuy, onSell }: Props) {
  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const [selected, setSelected] = useState<Item | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      setTab("buy");
      setSelected(null);
      setQuantity(1);
      setPicked(new Set());
    }
  }, [open]);

  // drop selections that no longer exist (after a sale)
  useEffect(() => {
    setPicked((prev) => {
      const ids = new Set(inventory.map((i) => i.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [inventory]);

  const sorted = useMemo(() => [...inventory].sort((a, b) => b.value - a.value), [inventory]);
  const chosen = useMemo(() => inventory.filter((i) => picked.has(i.id)), [inventory, picked]);

  const qty = Number.isFinite(quantity) && quantity >= 1 ? Math.min(Math.floor(quantity), 100) : 0;
  const price = selected ? buyCoins(selected.value * qty) : 0;
  const canAfford = coins >= price;

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="Marketplace" wide>
      <div className="market-balance">
        <span className="muted">Your balance</span>
        <b>{coinIcon} {formatValue(coins)}</b>
      </div>

      <div className="auth-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "buy"}
          className={`auth-tabs__tab ${tab === "buy" ? "is-active" : ""}`}
          onClick={() => setTab("buy")}
        >
          Buy items
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "sell"}
          className={`auth-tabs__tab ${tab === "sell" ? "is-active" : ""}`}
          onClick={() => setTab("sell")}
        >
          Sell for coins
        </button>
      </div>

      {tab === "buy" ? (
        <>
          {catalog.length === 0 && <div className="empty">No items found. Check the items table in Supabase.</div>}

          <ul className="grid">
            {catalog.map((item) => (
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
                <div className="card__price">{coinIcon} {formatValue(buyCoins(item.value))}</div>
              </li>
            ))}
          </ul>

          <div className="modal__footer">
            <div className="modal__summary">
              {selected ? (
                <>
                  <b>
                    {qty}× {selected.name}
                  </b>
                  <b className={canAfford ? "text-accent" : "text-danger"}>{coinIcon} {formatValue(price)}</b>
                </>
              ) : (
                <span className="muted">Select an item to buy</span>
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
              <button
                className="btn btn--primary"
                onClick={() => selected && qty > 0 && onBuy(selected, qty)}
                disabled={!selected || qty < 1 || !canAfford || busy}
              >
                {selected && !canAfford ? "Not enough coins" : "Buy"}
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          {sorted.length === 0 ? (
            <div className="empty">You have no items to sell. Items inside an open match can't be sold.</div>
          ) : (
            <ul className="grid">
              {sorted.map((item) => (
                <li
                  key={item.id}
                  className={`card ${picked.has(item.id) ? "is-selected" : ""}`}
                  onClick={() => toggle(item.id)}
                >
                  <img src={img(item.image)} alt={item.name} />
                  <div className="card__name" title={item.name}>
                    {item.name}
                  </div>
                  <div className="card__value">💎 {formatValue(item.value)}</div>
                  <div className="card__price">{coinIcon} {formatValue(sellCoins(item.value))}</div>
                </li>
              ))}
            </ul>
          )}

          <div className="modal__footer">
            <div className="modal__summary">
              <span className="muted">
                {chosen.length} selected · 💎 {formatValue(sumValue(chosen))}
              </span>
              <b className="text-accent">+ {coinIcon} {formatValue(sellCoins(sumValue(chosen)))}</b>
            </div>
            <div className="modal__actions">
              <button
                className="btn btn--ghost"
                onClick={() => setPicked(new Set(sorted.map((i) => i.id)))}
                disabled={sorted.length === 0}
              >
                Select all
              </button>
              <button className="btn btn--ghost" onClick={() => setPicked(new Set())} disabled={picked.size === 0}>
                Clear
              </button>
              <button
                className="btn btn--primary"
                onClick={() => onSell(chosen)}
                disabled={chosen.length === 0 || busy}
              >
                Sell
              </button>
            </div>
          </div>
        </>
      )}

      <p className="muted market-note">Every 💎 1,000 of item value = {coinIcon} 18 coins.</p>
    </Modal>
  );
}
