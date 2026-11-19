import { useEffect, useMemo, useRef, useState } from "react";
import { adminGiveCoins, adminListPlayers, adminSetStock } from "../api";
import { useCoin } from "../coin";
import type { AdminPlayer, Item } from "../types";
import { formatValue, img } from "../utils";

interface Props {
  catalog: Item[];
  /** Reload the item catalog after a stock change. */
  onItemsChanged: () => void;
  onError: (message: string) => void;
}

export default function AdminPage({ catalog, onItemsChanged, onError }: Props) {
  const [tab, setTab] = useState<"stock" | "players">("stock");

  return (
    <>
      <div className="hero">
        <div>
          <h1>Admin panel</h1>
          <p className="muted">Manage marketplace stock and players.</p>
        </div>
      </div>

      <div className="auth-tabs admin-tabs" role="tablist">
        <button className={`auth-tabs__tab ${tab === "stock" ? "is-active" : ""}`} onClick={() => setTab("stock")}>
          Stock
        </button>
        <button className={`auth-tabs__tab ${tab === "players" ? "is-active" : ""}`} onClick={() => setTab("players")}>
          Players
        </button>
      </div>

      {tab === "stock" ? (
        <StockTab catalog={catalog} onChanged={onItemsChanged} onError={onError} />
      ) : (
        <PlayersTab onError={onError} />
      )}
    </>
  );
}

function PlayersTab({ onError }: { onError: (m: string) => void }) {
  const coin = useCoin();
  const [players, setPlayers] = useState<AdminPlayer[] | null>(null);
  const [search, setSearch] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  // keep the latest onError without re-running the loader when the parent re-renders
  const errorRef = useRef(onError);
  errorRef.current = onError;

  useEffect(() => {
    let cancelled = false;
    adminListPlayers()
      .then((rows) => {
        if (!cancelled) setPlayers(rows.map((p) => ({ ...p, coins: Number(p.coins), profit: Number(p.profit) })));
      })
      .catch((e) => {
        errorRef.current(e instanceof Error ? e.message : "Couldn't load players.");
        if (!cancelled) setPlayers([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (players ?? []).filter((p) => p.username.toLowerCase().includes(q));
  }, [players, search]);

  async function give(p: AdminPlayer, sign: 1 | -1) {
    const n = parseInt(amounts[p.id] ?? "", 10);
    if (!Number.isFinite(n) || n <= 0) {
      onError("Enter an amount above 0.");
      return;
    }
    setBusyId(p.id);
    try {
      const balance = await adminGiveCoins(p.id, sign * n);
      setPlayers((all) => (all ?? []).map((x) => (x.id === p.id ? { ...x, coins: Number(balance) } : x)));
      setAmounts((a) => ({ ...a, [p.id]: "" }));
    } catch (e) {
      onError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="panel">
      <div className="panel__head">
        <h2>Players</h2>
        <span className="muted">{players ? `${players.length} players` : ""}</span>
      </div>
      <div className="toolbar">
        <input className="input" placeholder="Search players…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {players === null && <div className="empty">Loading…</div>}
      {players && shown.length === 0 && <div className="empty">No players found.</div>}

      <ul className="matches">
        {shown.map((p) => (
          <li key={p.id} className="admin-row admin-player">
            <div className="admin-row__info">
              <b>
                {p.username} {p.is_admin && <span className="tag">Admin</span>}
              </b>
              <div className="muted">
                Profit 💎 {p.profit < 0 ? "-" : ""}
                {formatValue(Math.abs(p.profit))}
              </div>
            </div>
            <div className="admin-row__stats">
              <div className="match__total">
                {coin} {formatValue(p.coins)}
              </div>
            </div>
            <div className="admin-row__buttons">
              <input
                className="input input--qty admin-player__amount"
                type="number"
                min={1}
                placeholder="Amount"
                value={amounts[p.id] ?? ""}
                onChange={(e) => setAmounts((a) => ({ ...a, [p.id]: e.target.value }))}
              />
              <button className="btn btn--primary btn--sm" disabled={busyId === p.id} onClick={() => give(p, 1)}>
                Give
              </button>
              <button className="btn btn--ghost btn--sm" disabled={busyId === p.id} onClick={() => give(p, -1)}>
                Take
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StockTab({ catalog, onChanged, onError }: { catalog: Item[]; onChanged: () => void; onError: (m: string) => void }) {
  const [search, setSearch] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busyName, setBusyName] = useState<string | null>(null);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.filter((i) => i.name.toLowerCase().includes(q)).sort((a, b) => b.value - a.value);
  }, [catalog, search]);

  async function save(item: Item) {
    const n = parseInt(edits[item.name] ?? "", 10);
    if (!Number.isFinite(n) || n < 0) {
      onError("Enter a stock of 0 or more.");
      return;
    }
    setBusyName(item.name);
    try {
      await adminSetStock(item.name, n);
      setEdits((e) => {
        const next = { ...e };
        delete next[item.name];
        return next;
      });
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusyName(null);
    }
  }

  return (
    <section className="panel">
      <div className="panel__head">
        <h2>Marketplace stock</h2>
        <span className="muted">Taxed items from matches are added here automatically</span>
      </div>
      <div className="toolbar">
        <input className="input" type="search" placeholder="Search items…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <ul className="matches">
        {shown.map((item) => {
          const edit = edits[item.name];
          const dirty = edit !== undefined && edit !== String(item.stock ?? 0);
          return (
            <li key={item.name} className="admin-row admin-player">
              <div className="admin-row__info">
                <div className="stock-row">
                  <img src={img(item.image)} alt="" decoding="async" />
                  <div>
                    <b>{item.name}</b>
                    <div className="muted">💎 {formatValue(item.value)}</div>
                  </div>
                </div>
              </div>
              <div className="admin-row__stats">
                <div className="muted">In stock</div>
                <div className="match__total">{formatValue(item.stock ?? 0)}</div>
              </div>
              <div className="admin-row__buttons">
                <input
                  className="input input--qty admin-player__amount"
                  type="number"
                  min={0}
                  placeholder="New stock"
                  value={edit ?? ""}
                  onChange={(e) => setEdits((all) => ({ ...all, [item.name]: e.target.value }))}
                />
                <button className="btn btn--primary btn--sm" disabled={!dirty || busyName === item.name} onClick={() => save(item)}>
                  Save
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
