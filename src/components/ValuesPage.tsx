import { useMemo, useState } from "react";
import { adminUpdateItem } from "../api";
import { STABILITIES, stabilityOf } from "../stability";
import type { Item } from "../types";
import { img } from "../utils";
import Modal from "./Modal";

interface Props {
  catalog: Item[];
  isAdmin: boolean;
  /** Reload the catalog after an admin edit. */
  onSaved: () => void;
  onError: (message: string) => void;
}

type Sort = "value" | "name" | "demand" | "rarity";

const full = (n: number) => n.toLocaleString("en-US");

export default function ValuesPage({ catalog, isAdmin, onSaved, onError }: Props) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("value");
  const [stability, setStability] = useState("all");
  const [editing, setEditing] = useState<Item | null>(null);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = catalog.filter(
      (i) => i.name.toLowerCase().includes(q) && (stability === "all" || i.stability === stability)
    );
    list.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "demand") return (b.demand ?? -1) - (a.demand ?? -1) || b.value - a.value;
      if (sort === "rarity") return (b.rarity ?? -1) - (a.rarity ?? -1) || b.value - a.value;
      return b.value - a.value;
    });
    return list;
  }, [catalog, search, sort, stability]);

  return (
    <>
      <div className="hero">
        <div>
          <h1>Value List</h1>
          <p className="muted">What every item is worth, how in-demand it is and where its value is heading.</p>
        </div>
      </div>

      <section className="panel">
        <div className="market-toolbar">
          <input
            className="input market-search"
            type="search"
            placeholder="Search items…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="input market-sort" value={stability} onChange={(e) => setStability(e.target.value)}>
            <option value="all">All stabilities</option>
            {STABILITIES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <select className="input market-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="value">Value: high to low</option>
            <option value="demand">Demand: high to low</option>
            <option value="rarity">Rarity: high to low</option>
            <option value="name">Name: A–Z</option>
          </select>
        </div>

        {catalog.length === 0 && <div className="empty">No items found.</div>}
        {catalog.length > 0 && shown.length === 0 && <div className="empty">No items match.</div>}

        <ul className="vgrid">
          {shown.map((item) => {
            const st = stabilityOf(item.stability);
            return (
              <li key={item.name} className="vcard">
                <img className="vcard__img" src={img(item.image)} alt={item.name} loading="lazy" decoding="async" />
                <div className="vcard__body">
                  <div className="vcard__name">{item.name}</div>
                  <div className="vcard__line">
                    <span>Value</span> - <b className="vcard__value">{full(item.value)}</b>
                  </div>
                  <div className="vcard__line">
                    <span>Range</span> - <b>[{item.value_range || "N/A"}]</b>
                  </div>
                  <div className="vcard__line">
                    <span>Stability</span> -{" "}
                    <b style={st ? { color: st.color } : undefined}>{st ? st.label : "N/A"}</b>
                  </div>
                  <div className="vcard__line">
                    <span>Demand</span> - <b>{item.demand ?? "N/A"}</b>
                  </div>
                  <div className="vcard__line">
                    <span>Rarity</span> - <b>{item.rarity ?? "N/A"}</b>
                  </div>
                  {isAdmin && (
                    <button className="btn btn--ghost btn--sm vcard__edit" onClick={() => setEditing(item)}>
                      Edit
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {editing && (
        <ItemEditor
          key={editing.name}
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onSaved();
          }}
          onError={onError}
        />
      )}
    </>
  );
}

function ItemEditor({
  item,
  onClose,
  onSaved,
  onError,
}: {
  item: Item;
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const [value, setValue] = useState(String(item.value));
  const [range, setRange] = useState(item.value_range ?? "");
  const [stability, setStability] = useState(item.stability ?? "");
  const [demand, setDemand] = useState(item.demand == null ? "" : String(item.demand));
  const [rarity, setRarity] = useState(item.rarity == null ? "" : String(item.rarity));
  const [busy, setBusy] = useState(false);

  const st = stabilityOf(stability);

  async function save() {
    const v = parseInt(value, 10);
    if (!Number.isFinite(v) || v < 1) {
      onError("The value must be at least 1.");
      return;
    }
    const d = demand === "" ? null : parseInt(demand, 10);
    const r = rarity === "" ? null : parseInt(rarity, 10);
    if ((d !== null && !(d >= 0 && d <= 10)) || (r !== null && !(r >= 0 && r <= 10))) {
      onError("Demand and rarity must be between 0 and 10.");
      return;
    }
    setBusy(true);
    try {
      await adminUpdateItem({
        name: item.name,
        value: v,
        demand: d,
        rarity: r,
        stability: stability || null,
        range,
      });
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Edit ${item.name}`}>
      <div className="editor__form">
        <label className="field">
          <span>Value</span>
          <input className="input" type="number" min={1} value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        <label className="field">
          <span>Range (leave empty for N/A)</span>
          <input className="input" value={range} maxLength={40} placeholder="e.g. 15,000 - 17,000" onChange={(e) => setRange(e.target.value)} />
        </label>
        <label className="field">
          <span>
            Stability{" "}
            {st && (
              <b className="stab-preview" style={{ color: st.color }}>
                {st.label}
              </b>
            )}
          </span>
          <select className="input" value={stability} onChange={(e) => setStability(e.target.value)}>
            <option value="">N/A</option>
            {STABILITIES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <div className="editor__two">
          <label className="field">
            <span>Demand (0-10)</span>
            <input className="input" type="number" min={0} max={10} value={demand} onChange={(e) => setDemand(e.target.value)} />
          </label>
          <label className="field">
            <span>Rarity (0-10)</span>
            <input className="input" type="number" min={0} max={10} value={rarity} onChange={(e) => setRarity(e.target.value)} />
          </label>
        </div>
        <button className="btn btn--primary btn--block" disabled={busy} onClick={save}>
          Save
        </button>
      </div>
    </Modal>
  );
}
