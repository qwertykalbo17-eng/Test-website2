import type { CaseDef } from "../types";
import { formatValue, img } from "../utils";

/** Collapsible list of what a case can drop and how likely each item is. */
export default function CaseOdds({ c }: { c: CaseDef }) {
  return (
    <details className="odds" onClick={(e) => e.stopPropagation()}>
      <summary>View items ({c.items.length})</summary>
      <ul className="odds__list">
        {c.items.map((item) => (
          <li key={item.name}>
            <img src={img(item.image)} alt="" />
            <span className="odds__name">{item.name}</span>
            <span className="muted">💎 {formatValue(item.value)}</span>
            <b>{item.chance}%</b>
          </li>
        ))}
      </ul>
    </details>
  );
}
