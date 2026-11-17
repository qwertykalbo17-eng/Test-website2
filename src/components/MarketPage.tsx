import { useEffect, useMemo, useState } from "react";
import { useCoin } from "../coin";
import type { InvItem, Item } from "../types";
import { buyCoins, formatValue, img, sellCoins, sumValue } from "../utils";

export interface CartLine {
  name: string;
  qty: number;
}

interface Props {
  /** The item catalog with stock. */
  catalog: Item[];
  /** Your items that are not locked inside an open match. */
  inventory: InvItem[];
  coins: number;
  loggedIn: boolean;
  busy: boolean;
  onLogin: () => void;
  /** Resolves true when the purchase went through. */
  onBuy: (cart: CartLine[]) => Promise<boolean>;
  onSell: (items: InvItem[]) => void;
  /** Reload the catalog (stock changes as other players buy). */
  onRefresh: () => void;
}

type Sort = "high" | "low" | "name";

const MAX_ITEMS_PER_ORDER = 100;
const REFRESH_MS = 10000;

export default function MarketPage({ catalog, inventory, coins, loggedIn, busy, onLogin, onBuy, onSell, onRefresh }: Props) {
  const coin = useCoin();
  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("high");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [picked, setPicked] = useState<Set<string>>(new Set());

  // keep the stock numbers fresh while this page is open
  useEffect(() => {
    onRefresh();
    const t = setInterval(() => {
      if (!document.hidden) onRefresh();
    }, REFRESH_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // drop sell selections that no longer exist (after a sale)
  useEffect(() => {
    setPicked((prev) => {
      const ids = new Set(inventory.map((i) => i.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [inventory]);

  const q = search.trim().toLowerCase();

  // ----- buying -----
  const stockOf = useMemo(() => new Map(catalog.map((i) => [i.name, i.stock ?? 0])), [catalog]);
  const shownBuy = useMemo(() => {
    const list = catalog.filter((i) => i.name.toLowerCase().includes(q));
    list.sort((a, b) => {
      const aOut = (a.stock ?? 0) <= 0 ? 1 : 0;
      const bOut = (b.stock ?? 0) <= 0 ? 1 : 0;
      if (aOut !== bOut) return aOut - bOut; // in-stock first
      if (sort === "name") return a.name.localeCompare(b.name);
      return sort === "high" ? b.value - a.value : a.value - b.value;
    });
    return list;
  }, [catalog, q, sort]);

  // quantities can't be above the current stock
  const lines: CartLine[] = Object.entries(cart)
    .map(([name, qty]) => ({ name, qty: Math.min(qty, stockOf.get(name) ?? 0) }))
    .filter((l) => l.qty > 0);
  const totalQty = lines.reduce((s, l) => s + l.qty, 0);
  const totalValue = lines.reduce((s, l) => s + l.qty * (catalog.find((i) => i.name === l.name)?.value ?? 0), 0);
  const price = buyCoins(totalValue);
  const canAfford = coins >= price;

  function setQty(item: Item, qty: number) {
    const stock = item.stock ?? 0;
    const others = totalQty - Math.min(cart[item.name] ?? 0, stock);
    const clamped = Math.max(0, Math.min(qty, stock, MAX_ITEMS_PER_ORDER - others));
    setCart((c) => {
      const next = { ...c };
      if (clamped <= 0) delete next[item.name];
      else next[item.name] = clamped;
      return next;
    });
  }

  async function buy() {
    const ok = await onBuy(lines);
    if (ok) setCart({});
  }

  // ----- selling -----
  const sorted = useMemo(
    () => [...inventory].filter((i) => i.name.toLowerCase().includes(q)).sort((a, b) => b.value - a.value),
    [inventory, q]
  );
  const chosen = useMemo(() => inventory.filter((i) => picked.has(i.id)), [inventory, picked]);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <div className="hero">
        <div>
          <h1>Marketplace</h1>
          <p className="muted">Buy items with coins, or sell yours for coins. Every 💎 1,000 of value = {coin} 18.</p>
        </div>
        {loggedIn && (
          <div className="market-balance market-balance--inline">
            <span className="muted">Balance</span>
            <b>
              {coin} {formatValue(coins)}
            </b>
          </div>
        )}
      </div>

      <section className="panel">
        <div className="market-toolbar">
          <div className="auth-tabs market-tabs" role="tablist">
            <button className={`auth-tabs__tab ${tab === "buy" ? "is-active" : ""}`} onClick={() => setTab("buy")}>
              Buy items
            </button>
            <button className={`auth-tabs__tab ${tab === "sell" ? "is-active" : ""}`} onClick={() => setTab("sell")}>
              Sell for coins
            </button>
          </div>
          <input
            className="input market-search"
            type="search"
            placeholder="Search items…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {tab === "buy" && (
            <select className="input market-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="high">Price: high to low</option>
              <option value="low">Price: low to high</option>
              <option value="name">Name: A–Z</option>
            </select>
          )}
        </div>

        {tab === "buy" ? (
          <>
            {catalog.length === 0 && <div className="empty">No items found.</div>}
            {catalog.length > 0 && shownBuy.length === 0 && <div className="empty">No items match “{search}”.</div>}

            <ul className="grid">
              {shownBuy.map((item) => {
                const stock = item.stock ?? 0;
                const qty = Math.min(cart[item.name] ?? 0, stock);
                const out = stock <= 0;
                return (
                  <li
                    key={item.name}
                    className={`card ${qty > 0 ? "is-selected" : ""} ${out ? "is-out" : ""}`}
                    onClick={() => !out && setQty(item, qty > 0 ? 0 : 1)}
                  >
                    <img src={img(item.image)} alt={item.name} loading="lazy" decoding="async" />
                    <div className="card__name" title={item.name}>
                      {item.name}
                    </div>
                    <div className="card__value">💎 {formatValue(item.value)}</div>
                    <div className="card__price">
                      {coin} {formatValue(buyCoins(item.value))}
                    </div>
                    <div className={`card__stock ${out ? "is-out" : ""}`}>{out ? "Out of stock" : `Stock: ${formatValue(stock)}`}</div>
                    {qty > 0 && (
                      <div className="stepper" onClick={(e) => e.stopPropagation()}>
                        <button className="btn btn--ghost btn--sm" onClick={() => setQty(item, qty - 1)}>
                          −
                        </button>
                        <b>{qty}</b>
                        <button
                          className="btn btn--ghost btn--sm"
                          onClick={() => setQty(item, qty + 1)}
                          disabled={qty >= stock || totalQty >= MAX_ITEMS_PER_ORDER}
                        >
                          +
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="modal__footer market-footer">
              <div className="modal__summary">
                {totalQty > 0 ? (
                  <>
                    <b>
                      {totalQty} item{totalQty === 1 ? "" : "s"} selected
                    </b>
                    <b className={canAfford || !loggedIn ? "text-accent" : "text-danger"}>
                      {coin} {formatValue(price)}
                    </b>
                  </>
                ) : (
                  <span className="muted">Tap items to select them. You can pick as many as you like.</span>
                )}
              </div>
              <div className="modal__actions">
                {totalQty > 0 && (
                  <button className="btn btn--ghost" onClick={() => setCart({})}>
                    Clear
                  </button>
                )}
                {loggedIn ? (
                  <button className="btn btn--primary" disabled={totalQty === 0 || !canAfford || busy} onClick={buy}>
                    {totalQty > 0 && !canAfford ? "Not enough coins" : "Buy"}
                  </button>
                ) : (
                  <button className="btn btn--primary" onClick={onLogin}>
                    Log in to buy
                  </button>
                )}
              </div>
            </div>
          </>
        ) : !loggedIn ? (
          <div className="empty">
            Log in to sell your items. <button className="btn btn--primary btn--sm" onClick={onLogin}>Log in</button>
          </div>
        ) : (
          <>
            {inventory.length === 0 && (
              <div className="empty">You have no items to sell. Items inside an open match can't be sold.</div>
            )}
            {inventory.length > 0 && sorted.length === 0 && <div className="empty">No items match “{search}”.</div>}

            <ul className="grid">
              {sorted.map((item) => (
                <li
                  key={item.id}
                  className={`card ${picked.has(item.id) ? "is-selected" : ""}`}
                  onClick={() => toggle(item.id)}
                >
                  <img src={img(item.image)} alt={item.name} loading="lazy" decoding="async" />
                  <div className="card__name" title={item.name}>
                    {item.name}
                  </div>
                  <div className="card__value">💎 {formatValue(item.value)}</div>
                  <div className="card__price">
                    {coin} {formatValue(sellCoins(item.value))}
                  </div>
                </li>
              ))}
            </ul>

            <div className="modal__footer market-footer">
              <div className="modal__summary">
                <span className="muted">
                  {chosen.length} selected · 💎 {formatValue(sumValue(chosen))}
                </span>
                <b className="text-accent">
                  + {coin} {formatValue(sellCoins(sumValue(chosen)))}
                </b>
              </div>
              <div className="modal__actions">
                <button
                  className="btn btn--ghost"
                  onClick={() => setPicked(new Set(sorted.map((i) => i.id)))}
                  disabled={sorted.length === 0}
                >
                  Select all{q ? " shown" : ""}
                </button>
                <button className="btn btn--ghost" onClick={() => setPicked(new Set())} disabled={picked.size === 0}>
                  Clear
                </button>
                <button className="btn btn--primary" onClick={() => onSell(chosen)} disabled={chosen.length === 0 || busy}>
                  Sell
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </>
  );
}
