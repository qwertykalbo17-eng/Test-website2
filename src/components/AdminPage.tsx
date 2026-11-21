import { useEffect, useMemo, useRef, useState } from "react";
import { adminCrashGetQueue, adminCrashSetQueue, adminGiveCoins, adminListPlayers, adminSetStock, adminWheelGetNext, adminWheelGetOdds, adminWheelSetNext, adminWheelSetOdds } from "../api";
import type { WheelNext, WheelOdds } from "../api";
import CashHuntAdmin from "./CashHuntAdmin";
import { useCoin } from "../coin";
import type { AdminPlayer, Item, WheelTarget } from "../types";
import { formatValue, img } from "../utils";

interface Props {
  catalog: Item[];
  /** Reload the item catalog after a stock change. */
  onItemsChanged: () => void;
  onError: (message: string) => void;
}

export default function AdminPage({ catalog, onItemsChanged, onError }: Props) {
  const [tab, setTab] = useState<"stock" | "players" | "wheel" | "crash">("stock");

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
        <button className={`auth-tabs__tab ${tab === "wheel" ? "is-active" : ""}`} onClick={() => setTab("wheel")}>
          Wheel
        </button>
        <button className={`auth-tabs__tab ${tab === "crash" ? "is-active" : ""}`} onClick={() => setTab("crash")}>
          Crash
        </button>
      </div>

      {tab === "stock" ? (
        <StockTab catalog={catalog} onChanged={onItemsChanged} onError={onError} />
      ) : tab === "players" ? (
        <PlayersTab onError={onError} />
      ) : tab === "crash" ? (
        <CrashTab onError={onError} />
      ) : (
        <>
          <WheelTab onError={onError} />
          <OddsPanel onError={onError} />
          <CashHuntAdmin onError={onError} />
        </>
      )}
    </>
  );
}

const CRASH_QUEUE_SIZE = 5;

function CrashTab({ onError }: { onError: (m: string) => void }) {
  const [slots, setSlots] = useState<string[]>(() => Array(CRASH_QUEUE_SIZE).fill(""));
  const [queued, setQueued] = useState<number[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = () =>
    adminCrashGetQueue()
      .then((q) => {
        const list = (q ?? []).map(Number);
        setQueued(list);
        setSlots(Array.from({ length: CRASH_QUEUE_SIZE }, (_, i) => (list[i] !== undefined ? String(list[i]) : "")));
      })
      .catch((e) => onError(e instanceof Error ? e.message : "Couldn't load the queue."));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, []);

  async function save(points: number[], text: string) {
    setBusy(true);
    setMsg("");
    try {
      await adminCrashSetQueue(points);
      await load();
      setMsg(text);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function apply() {
    const points: number[] = [];
    for (const raw of slots) {
      if (raw.trim() === "") continue; // empty slots are skipped
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 1 || n > 15000) {
        onError("Each crash point must be between 1.00 and 15000.");
        return;
      }
      points.push(Math.round(n * 100) / 100);
    }
    void save(points, points.length ? `Queued ${points.length} round${points.length === 1 ? "" : "s"}.` : "Queue cleared (random).");
  }

  return (
    <div className="panel admin-wheel">
      <h2>Crash queue</h2>
      <p className="muted">
        Set the crash point of the next rounds, up to {CRASH_QUEUE_SIZE}. They are used in order, one per new round. Empty slots are
        skipped, and once the queue runs out rounds are random again. The round that is already running is not changed.
      </p>

      <div className="admin-odds__grid">
        {slots.map((v, i) => (
          <label key={i} className="admin-wheel__field">
            <span>Round {i + 1}{i === 0 ? " (next)" : ""}</span>
            <input
              className="input"
              type="number"
              min={1}
              max={15000}
              step="0.01"
              placeholder="Random"
              value={v}
              onChange={(e) => setSlots((all) => all.map((x, j) => (j === i ? e.target.value : x)))}
            />
          </label>
        ))}
      </div>

      <div className="admin-wheel__actions">
        <button className="btn btn--primary" disabled={busy} onClick={apply}>Save queue</button>
        <button className="btn btn--ghost" disabled={busy} onClick={() => void save([], "Queue cleared (random).")}>
          Clear (random)
        </button>
      </div>

      <p className="admin-wheel__queued">
        <strong>Queued:</strong> {queued === null ? "…" : queued.length ? queued.map((x) => `${x.toFixed(2)}x`).join(" → ") : "nothing (random)"}
      </p>
      {msg && <p className="muted">{msg}</p>}
    </div>
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

const SEGMENTS: WheelTarget[] = ["2x", "3x", "5x", "10x", "coinflip", "bonus", "crazytime", "cashhunt"];
const BOOSTS = [2, 3, 4, 5, 7, 10, 15, 25, 50];
const segLabel = (t: WheelTarget) =>
  t === "coinflip" ? "Coinflip" : t === "bonus" ? "Bonus" : t === "crazytime" ? "Crazy Time" : t === "cashhunt" ? "Cash Hunt" : t;

function WheelTab({ onError }: { onError: (m: string) => void }) {
  const [result, setResult] = useState<string>("");
  const [mult, setMult] = useState<string>("");
  const [boost, setBoost] = useState<string>("");
  const [boostTarget, setBoostTarget] = useState<string>("");
  const [queued, setQueued] = useState<WheelNext | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = () => adminWheelGetNext().then(setQueued).catch((e) => onError(e.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, []);

  const boostOn = boost !== "" && boost !== "1";

  const save = async (n: WheelNext, text: string) => {
    setBusy(true);
    setMsg("");
    try {
      await adminWheelSetNext(n);
      await load();
      setMsg(text);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const apply = () =>
    save(
      {
        result: (result || null) as WheelTarget | null,
        mult: (result === "bonus" || result === "coinflip") && mult ? Number(mult) : null,
        boost_target: boostOn && boostTarget ? (boostTarget as WheelTarget) : null,
        boost_mult: boost ? Number(boost) : null,
      },
      "Saved. This applies to the next round that starts, once."
    );

  const clear = () => {
    setResult("");
    setMult("");
    setBoost("");
    setBoostTarget("");
    return save({ result: null, mult: null, boost_target: null, boost_mult: null }, "Cleared. The next round is random.");
  };

  const describe = (n: WheelNext) => {
    const parts: string[] = [];
    if (n.result) parts.push(`Result: ${segLabel(n.result)}${n.mult ? ` ${n.mult}x` : ""}`);
    if (n.boost_mult === 1) parts.push("Boost: none");
    else if (n.boost_mult) parts.push(`Boost: ${n.boost_mult}x on ${n.boost_target ? segLabel(n.boost_target) : "a random segment"}`);
    return parts.length ? parts.join(" · ") : "Nothing queued, the next round is random.";
  };

  return (
    <div className="panel admin-wheel">
      <h2>Next wheel round</h2>
      <p className="muted">
        Pick what happens in the next round that starts. It is used once, then the wheel goes back to random. A round that is
        already running is not changed.
      </p>

      <div className="admin-wheel__grid">
        <label className="admin-wheel__field">
          <span>Winning segment</span>
          <select className="input" value={result} onChange={(e) => { setResult(e.target.value); setMult(""); }}>
            <option value="">Random</option>
            {SEGMENTS.map((s) => <option key={s} value={s}>{segLabel(s)}</option>)}
          </select>
        </label>

        {result === "coinflip" && (
          <label className="admin-wheel__field">
            <span>Coinflip result</span>
            <select className="input" value={mult} onChange={(e) => setMult(e.target.value)}>
              <option value="">Random</option>
              <option value="7">Heads · 7x</option>
              <option value="25">Tails · 25x</option>
            </select>
          </label>
        )}
        {result === "bonus" && (
          <label className="admin-wheel__field">
            <span>Bonus multiplier</span>
            <select className="input" value={mult} onChange={(e) => setMult(e.target.value)}>
              <option value="">Random</option>
              {Array.from({ length: 89 }, (_, i) => i + 11).map((m) => <option key={m} value={m}>{m}x</option>)}
            </select>
          </label>
        )}

        <label className="admin-wheel__field">
          <span>Boost multiplier</span>
          <select className="input" value={boost} onChange={(e) => { setBoost(e.target.value); if (e.target.value === "" || e.target.value === "1") setBoostTarget(""); }}>
            <option value="">Random</option>
            <option value="1">No boost</option>
            {BOOSTS.map((b) => <option key={b} value={b}>{b}x</option>)}
          </select>
        </label>

        <label className="admin-wheel__field">
          <span>Boost goes on</span>
          <select className="input" value={boostTarget} disabled={!boostOn} onChange={(e) => setBoostTarget(e.target.value)}>
            <option value="">Random segment</option>
            {SEGMENTS.map((s) => <option key={s} value={s}>{segLabel(s)}</option>)}
          </select>
        </label>
      </div>

      <div className="admin-wheel__actions">
        <button className="btn btn--primary" disabled={busy} onClick={apply}>Set next round</button>
        <button className="btn btn--ghost" disabled={busy} onClick={clear}>Clear (random)</button>
      </div>

      <p className="admin-wheel__queued">
        <strong>Queued:</strong> {queued ? describe(queued) : "…"}
      </p>
      {msg && <p className="muted">{msg}</p>}
    </div>
  );
}

const DEFAULT_CRAZY_BOARD_ODDS: Record<string, number> = {
  "10": 10,
  "20": 5,
  "30": 3,
  "50": 2,
  "100": 1,
  double: 7,
};

const CRAZY_BOARD_ORDER = ["10", "20", "30", "50", "100", "double"];

const crazySlotLabel = (k: string) => (k === "double" ? "DOUBLE (Respin)" : `${k}x`);

const ODDS_GROUPS: { kind: keyof WheelOdds; title: string; hint: string; label: (k: string) => string; order: string[] }[] = [
  {
    kind: "segment",
    title: "Winning segment",
    hint: "Chance of each segment winning.",
    label: (k) => segLabel(k as WheelTarget),
    order: ["2x", "3x", "5x", "10x", "coinflip", "bonus", "crazytime", "cashhunt"],
  },
  {
    kind: "boost",
    title: "Boost multiplier",
    hint: 'Chance of each boost. "None" means no boost that round.',
    label: (k) => (k === "1" ? "None" : `${k}x`),
    order: ["1", "2", "3", "4", "5", "7", "10", "15", "25", "50"],
  },
  {
    kind: "coinflip",
    title: "Coinflip result",
    hint: "Heads pays 7x, Tails pays 25x.",
    label: (k) => (k === "7" ? "Heads 7x" : "Tails 25x"),
    order: ["7", "25"],
  },
];

function OddsPanel({ onError }: { onError: (m: string) => void }) {
  const [odds, setOdds] = useState<Record<string, Record<string, string>> | null>(null);
  const [crazyOdds, setCrazyOdds] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const k of CRAZY_BOARD_ORDER) init[k] = String(DEFAULT_CRAZY_BOARD_ODDS[k]);
    return init;
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = () =>
    adminWheelGetOdds()
      .then((o) => {
        const raw = o as unknown as Record<string, Record<string, number> | undefined>;
        const next: Record<string, Record<string, string>> = {};
        for (const g of ODDS_GROUPS) {
          next[g.kind] = {};
          for (const k of g.order) next[g.kind][k] = String(raw[g.kind]?.[k] ?? (g.kind === "segment" && (k === "crazytime" ? 3 : k === "cashhunt" ? 6 : 0)));
        }
        setOdds(next);

        const nextCrazy: Record<string, string> = {};
        for (const k of CRAZY_BOARD_ORDER) {
          nextCrazy[k] = String(raw.crazytime?.[k] ?? DEFAULT_CRAZY_BOARD_ODDS[k]);
        }
        setCrazyOdds(nextCrazy);
      })
      .catch((e) => onError(e.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, []);

  const run = async (fn: () => Promise<void>, text: string) => {
    setBusy(true);
    setMsg("");
    try {
      await fn();
      await load();
      setMsg(text);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!odds) return;
    const out: Record<string, Record<string, number>> = {};
    for (const g of ODDS_GROUPS) {
      out[g.kind] = {};
      for (const k of g.order) {
        const n = Number(odds[g.kind][k]);
        if (!Number.isFinite(n) || n < 0) {
          onError("Odds must be numbers of 0 or more.");
          return;
        }
        out[g.kind][k] = n;
      }
    }

    const crazyOut: Record<string, number> = {};
    for (const k of CRAZY_BOARD_ORDER) {
      const n = Number(crazyOdds[k]);
      if (!Number.isFinite(n) || n < 0) {
        onError("Crazy Time odds must be numbers of 0 or more.");
        return;
      }
      crazyOut[k] = n;
    }
    out.crazytime = crazyOut;

    void run(() => adminWheelSetOdds(out as unknown as WheelOdds), "Odds saved. They apply from the next round that starts.");
  };

  const resetDefaults = () => {
    const resetCrazy: Record<string, string> = {};
    for (const k of CRAZY_BOARD_ORDER) resetCrazy[k] = String(DEFAULT_CRAZY_BOARD_ODDS[k]);
    setCrazyOdds(resetCrazy);
    return run(() => adminWheelSetOdds(null), "Odds reset to the defaults.");
  };

  if (!odds) return null;

  const crazyTotal = CRAZY_BOARD_ORDER.reduce((sum, k) => sum + (Number(crazyOdds[k]) || 0), 0);

  return (
    <div className="panel admin-wheel admin-odds">
      <h2>Wheel odds</h2>
      <p className="muted">
        Type any weights, they do not need to add up to 100. The percentage next to each box is its real chance. Changes apply from
        the next round that starts. Bonus keeps its 11x–99x spread (lower is more common).
      </p>
      {ODDS_GROUPS.map((g) => {
        const total = g.order.reduce((a, k) => a + (Number(odds[g.kind][k]) || 0), 0);
        return (
          <div key={g.kind} className="admin-odds__group">
            <h3>{g.title}</h3>
            <p className="muted">{g.hint}</p>
            <div className="admin-odds__grid">
              {g.order.map((k) => {
                const w = Number(odds[g.kind][k]) || 0;
                return (
                  <label key={k} className="admin-wheel__field">
                    <span>{g.label(k)} · {total > 0 ? ((w / total) * 100).toFixed(1) : "0.0"}%</span>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      step="any"
                      value={odds[g.kind][k]}
                      onChange={(e) => setOdds({ ...odds, [g.kind]: { ...odds[g.kind], [k]: e.target.value } })}
                    />
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="admin-odds__group">
        <h3>Crazy Time board odds</h3>
        <p className="muted">
          Weights for each slot each Red, Green, and Blue arrow can land on (including DOUBLE respins). Pre-spin wheel boosts apply on top before arrows spin.
        </p>
        <div className="admin-odds__grid">
          {CRAZY_BOARD_ORDER.map((k) => {
            const w = Number(crazyOdds[k]) || 0;
            return (
              <label key={k} className="admin-wheel__field">
                <span>
                  {crazySlotLabel(k)} · {crazyTotal > 0 ? ((w / crazyTotal) * 100).toFixed(1) : "0.0"}%
                </span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  step="any"
                  value={crazyOdds[k]}
                  onChange={(e) => setCrazyOdds({ ...crazyOdds, [k]: e.target.value })}
                />
              </label>
            );
          })}
        </div>
      </div>

      <div className="admin-wheel__actions">
        <button className="btn btn--primary" disabled={busy} onClick={save}>Save odds</button>
        <button className="btn btn--ghost" disabled={busy} onClick={resetDefaults}>
          Reset to defaults
        </button>
      </div>
      {msg && <p className="muted">{msg}</p>}
    </div>
  );
}