import { useEffect, useMemo, useState } from "react";
import { useCoin } from "../coin";
import type { CaseInput } from "../api";
import type { CaseDef, Item } from "../types";
import { formatValue, img, sellCoins } from "../utils";
import Modal from "./Modal";

interface Props {
  open: boolean;
  /** The case being edited, or null to create a new one. */
  editing: CaseDef | null;
  catalog: Item[];
  busy: boolean;
  onClose: () => void;
  onSave: (input: CaseInput) => void;
}

interface Row {
  name: string;
  chance: number;
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;

export default function CaseEditorModal({ open, editing, catalog, busy, onClose, onSave }: Props) {
  const coin = useCoin();
  const [name, setName] = useState("");
  const [image, setImage] = useState("");
  const [price, setPrice] = useState(100);
  const [active, setActive] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [toAdd, setToAdd] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setImage(editing?.image ?? "");
    setPrice(editing?.price ?? 100);
    setActive(editing?.active ?? true);
    setRows(editing ? editing.items.map((i) => ({ name: i.name, chance: i.chance })) : []);
    setToAdd("");
  }, [open, editing]);

  const byName = useMemo(() => new Map(catalog.map((i) => [i.name, i])), [catalog]);
  const available = catalog.filter((i) => !rows.some((r) => r.name === i.name));

  const total = round4(rows.reduce((s, r) => s + (Number.isFinite(r.chance) ? r.chance : 0), 0));
  const totalOk = Math.abs(total - 100) <= 0.01;
  const expected = rows.reduce((s, r) => s + ((Number.isFinite(r.chance) ? r.chance : 0) / 100) * (byName.get(r.name)?.value ?? 0), 0);
  const valid =
    name.trim().length > 0 && Number.isFinite(price) && price >= 1 && rows.length > 0 && totalOk && rows.every((r) => r.chance > 0);

  function addItem() {
    if (!toAdd) return;
    setRows((r) => [...r, { name: toAdd, chance: 0 }]);
    setToAdd("");
  }

  function splitEvenly() {
    if (rows.length === 0) return;
    const each = round4(100 / rows.length);
    const first = round4(100 - each * (rows.length - 1));
    setRows((r) => r.map((row, i) => ({ ...row, chance: i === 0 ? first : each })));
  }

  function normalize() {
    if (total <= 0) return splitEvenly();
    const scaled = rows.map((r) => round4((r.chance / total) * 100));
    const diff = round4(100 - scaled.reduce((a, b) => a + b, 0));
    scaled[0] = round4(scaled[0] + diff);
    setRows((r) => r.map((row, i) => ({ ...row, chance: scaled[i] })));
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit case" : "New case"} wide>
      <div className="editor__top">
        <label className="field">
          <span>Case name</span>
          <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>Price ({coin} coins)</span>
          <input
            className="input"
            type="number"
            min={1}
            value={Number.isFinite(price) ? price : ""}
            onChange={(e) => setPrice(parseInt(e.target.value, 10))}
          />
        </label>
        <label className="field">
          <span>Image file (optional, from public/)</span>
          <input className="input" value={image} placeholder="e.g. mycase.png" onChange={(e) => setImage(e.target.value)} />
        </label>
        <label className="editor__check">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Visible to players
        </label>
      </div>

      <div className="editor__add">
        <select className="input" value={toAdd} onChange={(e) => setToAdd(e.target.value)}>
          <option value="">Add an item…</option>
          {available.map((i) => (
            <option key={i.name} value={i.name}>
              {i.name} — 💎 {formatValue(i.value)}
            </option>
          ))}
        </select>
        <button className="btn btn--primary btn--sm" onClick={addItem} disabled={!toAdd}>
          Add
        </button>
        <button className="btn btn--ghost btn--sm" onClick={splitEvenly} disabled={rows.length === 0}>
          Split evenly
        </button>
        <button className="btn btn--ghost btn--sm" onClick={normalize} disabled={rows.length === 0}>
          Scale to 100%
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="empty">Add the items this case can drop, then set each item's chance.</div>
      ) : (
        <ul className="editor__rows">
          {rows.map((r, i) => {
            const item = byName.get(r.name);
            return (
              <li key={r.name} className="editor__row">
                {item && <img src={img(item.image)} alt="" />}
                <span className="editor__name" title={r.name}>
                  {r.name}
                </span>
                <span className="muted">💎 {formatValue(item?.value ?? 0)}</span>
                <input
                  className="input input--qty"
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={Number.isFinite(r.chance) ? r.chance : ""}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setRows((all) => all.map((row, j) => (j === i ? { ...row, chance: v } : row)));
                  }}
                />
                <span className="muted">%</span>
                <button
                  className="icon-btn"
                  aria-label={`Remove ${r.name}`}
                  onClick={() => setRows((all) => all.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="modal__footer">
        <div className="modal__summary">
          <b className={totalOk ? "text-accent" : "text-danger"}>Total {total}% {totalOk ? "✓" : "(must be 100%)"}</b>
          {rows.length > 0 && (
            <span className="muted">
              Average pull 💎 {formatValue(Math.round(expected))} ≈ {coin} {formatValue(sellCoins(expected))} when sold, case
              costs {coin} {formatValue(Number.isFinite(price) ? price : 0)}
            </span>
          )}
        </div>
        <div className="modal__actions">
          <button
            className="btn btn--primary"
            disabled={!valid || busy}
            onClick={() =>
              onSave({
                id: editing?.id ?? null,
                name: name.trim(),
                image: image.trim(),
                price,
                active,
                items: rows.map((r) => ({ name: r.name, chance: r.chance })),
              })
            }
          >
            Save case
          </button>
        </div>
      </div>
    </Modal>
  );
}
