import { useEffect, useState } from "react";
import { adminCashHuntGet, adminCashHuntSet } from "../api";

interface Row {
  mult: string;
  weight: string;
}

/** Admin > Wheel: the multipliers the 9 Cash Hunt boxes are drawn from, and how common each one is. */
export default function CashHuntAdmin({ onError }: { onError: (m: string) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = () =>
    adminCashHuntGet()
      .then((list) => setRows((list ?? []).map((r) => ({ mult: String(r.mult), weight: String(r.weight) }))))
      .catch((e) => onError(e instanceof Error ? e.message : "Couldn't load Cash Hunt."));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, []);

  if (!rows) return null;

  const total = rows.reduce((a, r) => a + (Number(r.weight) || 0), 0);
  const avg = total > 0 ? rows.reduce((a, r) => a + (Number(r.mult) || 0) * (Number(r.weight) || 0), 0) / total : 0;

  async function save() {
    const out: { mult: number; weight: number }[] = [];
    for (const r of rows ?? []) {
      const mult = Number(r.mult);
      const weight = Number(r.weight);
      if (!Number.isInteger(mult) || mult < 1 || mult > 100000) {
        onError("Each multiplier must be a whole number from 1 to 100000.");
        return;
      }
      if (!Number.isFinite(weight) || weight < 0) {
        onError("Each weight must be 0 or more.");
        return;
      }
      out.push({ mult, weight });
    }
    setBusy(true);
    setMsg("");
    try {
      await adminCashHuntSet(out);
      await load();
      setMsg("Saved. It applies from the next Cash Hunt round that starts.");
    } catch (e) {
      onError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const edit = (i: number, key: keyof Row, v: string) =>
    setRows((all) => (all ?? []).map((r, j) => (j === i ? { ...r, [key]: v } : r)));

  return (
    <div className="panel admin-wheel">
      <h2>Cash Hunt boxes</h2>
      <p className="muted">
        Each of the 9 boxes is drawn from this list. Weight = how common that multiplier is (they do not need to add up to 100).
        A wheel boost on Cash Hunt multiplies every box. Average box right now: <strong>{avg.toFixed(1)}x</strong>.
      </p>

      {rows.map((r, i) => (
        <div key={i} className="hunt-admin__row">
          <label className="admin-wheel__field">
            <span>Multiplier</span>
            <input className="input" type="number" min={1} step={1} value={r.mult} onChange={(e) => edit(i, "mult", e.target.value)} />
          </label>
          <label className="admin-wheel__field">
            <span>
              Weight <span className="hunt-admin__pct">· {total > 0 ? (((Number(r.weight) || 0) / total) * 100).toFixed(1) : "0.0"}%</span>
            </span>
            <input className="input" type="number" min={0} step="any" value={r.weight} onChange={(e) => edit(i, "weight", e.target.value)} />
          </label>
          <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => setRows((all) => (all ?? []).filter((_, j) => j !== i))}>
            Remove
          </button>
        </div>
      ))}

      <div className="admin-wheel__actions">
        <button className="btn btn--ghost" disabled={busy || rows.length >= 40} onClick={() => setRows((all) => [...(all ?? []), { mult: "", weight: "1" }])}>
          Add multiplier
        </button>
        <button className="btn btn--primary" disabled={busy} onClick={save}>Save Cash Hunt</button>
      </div>
      {msg && <p className="muted">{msg}</p>}
    </div>
  );
}
