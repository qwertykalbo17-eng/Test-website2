import type { ReactNode } from "react";
import { formatValue } from "../utils";

export type Page = "coinflip" | "wheel" | "crash" | "market" | "values" | "leaderboard" | "admin";

/** One-colour line icons: they take the colour of the text around them (grey, accent when active). */
const PATHS: Record<string, ReactNode> = {
  coinflip: <><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9M9.5 9.8c.6-.9 1.6-1.3 2.6-1.3 1.4 0 2.4.7 2.4 1.7 0 2.2-5 1.1-5 3.4 0 1 1.1 1.8 2.6 1.8 1.1 0 2.1-.4 2.7-1.3"/></>,
  wheel: <><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.2"/><path d="M12 3.5v6.3M12 14.2v6.3M3.5 12h6.3M14.2 12h6.3M6 6l4.4 4.4M13.6 13.6L18 18M18 6l-4.4 4.4M10.4 13.6L6 18"/></>,
  crash: <><path d="M12 3c3 2.2 4.3 5.4 4 9.5l-1.4 2.5H9.4L8 12.5C7.7 8.4 9 5.2 12 3z"/><circle cx="12" cy="9.5" r="1.5"/><path d="M8.2 13.5L5 16.5l2.5-.5M15.8 13.5l3.2 3-2.5-.5M10.5 18.5c.4 1.2.8 2 1.5 3 .7-1 1.1-1.8 1.5-3"/></>,
  market: <><path d="M4 9l1.5-4.5h13L20 9M4 9v10h16V9M4 9c0 1.7 1.3 2.8 2.7 2.8S9.3 10.7 9.3 9c0 1.7 1.2 2.8 2.7 2.8s2.7-1.1 2.7-2.8c0 1.7 1.3 2.8 2.7 2.8S20 10.7 20 9M9.5 19v-4.5h5V19"/></>,
  ranks: <><path d="M7 4h10v5a5 5 0 01-10 0V4zM7 6H4v1.5C4 9.4 5.3 10.6 7 10.8M17 6h3v1.5c0 1.9-1.3 3.1-3 3.3M12 14v3.5M8.5 20h7M10 17.5h4"/></>,
  admin: <><path d="M12 3l7.5 3v5.5c0 4.5-3.1 8-7.5 9.5-4.4-1.5-7.5-5-7.5-9.5V6L12 3z"/><path d="M9 12l2.2 2.2L15.2 10"/></>,
  inventory: <><path d="M8 8V6.5A4 4 0 0112 3a4 4 0 014 3.5V8M6 8h12l1 12H5L6 8zM9.5 12.5h5"/></>,
  login: <><circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c.6-3.7 3.6-5.8 7.5-5.8s6.9 2.1 7.5 5.8"/></>,
};

function NavIcon({ name, size = 16 }: { name: string; size?: number }) {
  return (
    <svg
      className="nav-ico"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

interface Props {
  page: Page;
  onNavigate: (page: Page) => void;
  /** null when nobody is logged in */
  username: string | null;
  isAdmin: boolean;
  coins: number;
  coinIcon: string;
  inventoryValue: number;
  onOpenMarket: () => void;
  onLogin: () => void;
  onLogout: () => void;
  onOpenInventory: () => void;
}

const LINKS: { page: Page; icon: string; label: string; short: string }[] = [
  { page: "coinflip", icon: "coinflip", label: "Coinflip", short: "Coinflip" },
  { page: "wheel", icon: "wheel", label: "Wheel", short: "Wheel" },
  { page: "crash", icon: "crash", label: "Crash", short: "Crash" },
  { page: "market", icon: "market", label: "Marketplace", short: "Market" },
  { page: "leaderboard", icon: "ranks", label: "Leaderboard", short: "Ranks" },
];

export default function Navbar({
  page,
  onNavigate,
  username,
  isAdmin,
  coins,
  coinIcon,
  inventoryValue,
  onOpenMarket,
  onLogin,
  onLogout,
  onOpenInventory,
}: Props) {
  const loggedIn = username !== null;

  return (
    <>
      <header className="navbar">
        <div className="navbar__inner">
          <div className="navbar__left">
            <button type="button" className="brand brand--button" onClick={() => onNavigate("coinflip")}>
              Bloxy<span>Bet</span>
            </button>
          </div>

          {/* desktop links (hidden on phones, where the bottom bar is used) */}
          <nav className="navbar__links">
            {LINKS.map((l) => (
              <button
                key={l.page}
                className={`nav-link ${page === l.page ? "is-active" : ""}`}
                onClick={() => onNavigate(l.page)}
                title={l.label}
              >
                <NavIcon name={l.icon} />
                <span className="nav-link__text">{l.label}</span>
              </button>
            ))}
            {isAdmin && (
              <button
                className={`nav-link ${page === "admin" ? "is-active" : ""}`}
                onClick={() => onNavigate("admin")}
                title="Admin"
              >
                <NavIcon name="admin" />
                <span className="nav-link__text">Admin</span>
              </button>
            )}
          </nav>

          <div className="navbar__user">
            {loggedIn ? (
              <>
                <button
                  type="button"
                  className="profit-chip is-coins is-button"
                  onClick={onOpenMarket}
                  title="Open the marketplace"
                >
                  <span className="profit-chip__label">Coins</span>
                  <span>{coinIcon} {formatValue(coins)}</span>
                </button>
                <button
                  type="button"
                  className="profit-chip is-neutral is-button"
                  onClick={onOpenInventory}
                  title="View inventory"
                >
                  <span className="profit-chip__label">Inventory</span>
                  <span>💎 {formatValue(inventoryValue)}</span>
                </button>
                <span className="navbar__name">{username}</span>
                <button className="btn btn--ghost btn--sm" onClick={onLogout}>
                  Logout
                </button>
              </>
            ) : (
              <button className="btn btn--primary btn--sm" onClick={onLogin}>
                Login
              </button>
            )}
          </div>
        </div>
      </header>

      {/* phone navigation: fixed bar at the bottom of the screen */}
      <nav className="tabbar" aria-label="Main navigation">
        {LINKS.map((l) => (
          <button key={l.page} className={`tabbar__item ${page === l.page ? "is-active" : ""}`} onClick={() => onNavigate(l.page)}>
            <NavIcon name={l.icon} size={22} />
            <span>{l.short}</span>
          </button>
        ))}
        {loggedIn ? (
          <button className="tabbar__item" onClick={onOpenInventory}>
            <NavIcon name="inventory" size={22} />
            <span>Inventory</span>
          </button>
        ) : (
          <button className="tabbar__item" onClick={onLogin}>
            <NavIcon name="login" size={22} />
            <span>Login</span>
          </button>
        )}
        {isAdmin && (
          <button className={`tabbar__item ${page === "admin" ? "is-active" : ""}`} onClick={() => onNavigate("admin")}>
            <NavIcon name="admin" size={22} />
            <span>Admin</span>
          </button>
        )}
      </nav>
    </>
  );
}
