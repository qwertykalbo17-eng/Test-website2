import { useEffect, useMemo, useRef, useState } from "react";
import { adminGiveCoins, adminListPlayers, adminSaveCase, adminSetCaseActive, adminSetStock, type CaseInput } from "../api";
import { useCoin } from "../coin";
import type { AdminPlayer, CaseDef, Item } from "../types";
import { formatValue, img } from "../utils";
import CaseEditorModal from "./CaseEditorModal";

interface Props {
  cases: CaseDef[];
  catalog: Item[];
  /** Reload the case list after a change. */
  onCasesChanged: () => void;
  /** Reload the item catalog after a stock change. */
  onItemsChanged: () => void;
  onError: (message: string) => void;
}

export default function AdminPage({ cases, catalog, onCasesChanged, onItemsChanged, onError }: Props) {
  const [tab, setTab] = useState<"cases" | "stock" | "players">("cases");

  return (
    <>
      <div className="hero">
        <div>
          <h1>Admin panel</h1>
          <p className="muted">Create cases and manage players.</p>
        </div>
      </div>

      <div className="auth-tabs admin-tabs" role="tablist">
        <button className={`auth-tabs__tab ${tab === "cases" ? "is-active" : ""}`} onClick={() => setTab("cases")}>
          Cases
        </button>
        <button className={`auth-tabs__tab ${tab === "stock" ? "is-active" : ""}`} onClick={() => setTab("stock")}>
          Stock
        </button>
        <button className={`auth-tabs__tab ${tab === "players" ? "is-active" : ""}`} onClick={() => setTab("players")}>
          Players
        </button>
      </div>

      {tab === "cases" ? (
        <CasesTab cases={cases} catalog={catalog} onChanged={onCasesChanged} onError={onError} />
      ) : tab === "stock" ? (
        <StockTab catalog={catalog} onChanged={onItemsChanged} onError={onError} />
      ) : (
        <PlayersTab onError={onError} />
      )}
    </>
  );
}

function CasesTab({
  cases,
  catalog,
  onChanged,
  onError,
}: {
  cases: CaseDef[];
  catalog: Item[];
  onChanged: () => void;
  onError: (m: string) => void;
}) {
  const coin = useCoin();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<CaseDef | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function save(input: CaseInput) {
    return run(async () => {
      await adminSaveCase(input);
      setEditorOpen(false);
    });
  }

  return (
    <section className="panel">
      <div className="panel__head">
        <h2>Cases</h2>
        <button
          className="btn btn--primary btn--sm"
          onClick={() => {
            setEditing(null);
            setEditorOpen(true);
          }}
        >
          + New case
        </button>
      </div>

      {cases.length === 0 && <div className="empty">No cases yet. Press “New case” to make the first one.</div>}

      <ul className="matches">
        {cases.map((c) => {
          const ev = c.items.reduce((s, i) => s + (i.chance / 100) * i.value, 0);
          return (
            <li key={c.id} className={`cb admin-case ${c.active ? "" : "is-hidden"}`}>
              <div className="cb__info">
                <div className="cb__tags">
                  <b>{c.name}</b>
                  {!c.active && <span className="tag tag--crazy">Hidden</span>}
                </div>
                <div className="cb__cases">
                  {c.items.slice(0, 8).map((i) => (
                    <span key={i.name} className="cb__case" title={`${i.name} · ${i.chance}%`}>
                      <img src={img(i.image)} alt={i.name} />
                    </span>
                  ))}
                  {c.items.length > 8 && <span className="match__extra">+{c.items.length - 8}</span>}
                </div>
              </div>
              <div className="admin-case__stats">
                <div className="match__total">
                  {coin} {formatValue(c.price)}
                </div>
                <div className="muted">
                  {c.items.length} items · avg 💎 {formatValue(Math.round(ev))}
                </div>
              </div>
              <div className="cb__buttons">
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={() => {
                    setEditing(c);
                    setEditorOpen(true);
                  }}
                >
                  Edit
                </button>
                <button
                  className="btn btn--ghost btn--sm"
                  disabled={busy}
                  onClick={() => run(() => adminSetCaseActive(c.id, !c.active))}
                >
                  {c.active ? "Hide" : "Show"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <CaseEditorModal
        open={editorOpen}
        editing={editing}
        catalog={catalog}
        busy={busy}
        onClose={() => setEditorOpen(false)}
        onSave={save}
      />
    </section>
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
          <li key={p.id} className="cb admin-player">
            <div className="cb__info">
              <b>
                {p.username} {p.is_admin && <span className="tag">Admin</span>}
              </b>
              <div className="muted">
                Profit 💎 {p.profit < 0 ? "-" : ""}
                {formatValue(Math.abs(p.profit))}
              </div>
            </div>
            <div className="admin-case__stats">
              <div className="match__total">
                {coin} {formatValue(p.coins)}
              </div>
            </div>
            <div className="cb__buttons">
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
            <li key={item.name} className="cb admin-player">
              <div className="cb__info">
                <div className="stock-row">
                  <img src={img(item.image)} alt="" decoding="async" />
                  <div>
                    <b>{item.name}</b>
                    <div className="muted">💎 {formatValue(item.value)}</div>
                  </div>
                </div>
              </div>
              <div className="admin-case__stats">
                <div className="muted">In stock</div>
                <div className="match__total">{formatValue(item.stock ?? 0)}</div>
              </div>
              <div className="cb__buttons">
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
