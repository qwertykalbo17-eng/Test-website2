import type { Item } from "../types";
import { formatValue, img, sumValue } from "../utils";

/** Round avatar: the player's initial, or a robot for the bot. */
export function Avatar({
  name,
  bot,
  state,
}: {
  name: string;
  bot?: boolean;
  state?: "winner" | "loser";
}) {
  return (
    <div
      className={`hist-avatar ${state === "winner" ? "is-winner" : ""} ${state === "loser" ? "is-loser" : ""}`}
      title={name}
    >
      {bot ? "🤖" : name.slice(0, 1).toUpperCase()}
    </div>
  );
}

/** A list of bet items with their total on top. */
export function BetColumn({ title, items }: { title: string; items: Item[] }) {
  return (
    <div className="bet-col">
      <div className="bet-col__head">
        <span>{title}</span>
        <b>💎 {formatValue(sumValue(items))}</b>
      </div>
      <div className="bet-col__list">
        {items.length === 0 && <div className="empty empty--sm">No items</div>}
        {items.map((item, i) => (
          <div key={i} className="bet-row">
            <img src={img(item.image)} alt={item.name} />
            <span className="bet-row__name">{item.name}</span>
            <b>💎 {formatValue(item.value)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
