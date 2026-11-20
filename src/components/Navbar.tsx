import { formatValue } from "../utils";

export type Page = "coinflip" | "wheel" | "crash" | "market" | "values" | "leaderboard" | "admin";

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
            <button
              className={`nav-link ${page === "coinflip" ? "is-active" : ""}`}
              onClick={() => onNavigate("coinflip")}
              title="Coinflip"
            >
              <span aria-hidden="true"></span> <span className="nav-link__text">Coinflip</span>
            </button>
            <button
              className={`nav-link ${page === "wheel" ? "is-active" : ""}`}
              onClick={() => onNavigate("wheel")}
              title="Wheel"
            >
              <span aria-hidden="true"></span> <span className="nav-link__text">Wheel</span>
            </button>
            <button
              className={`nav-link ${page === "crash" ? "is-active" : ""}`}
              onClick={() => onNavigate("crash")}
              title="Crash"
            >
              <span aria-hidden="true">🚀</span> <span className="nav-link__text">Crash</span>
            </button>
            <button
              className={`nav-link ${page === "market" ? "is-active" : ""}`}
              onClick={() => onNavigate("market")}
              title="Marketplace"
            >
              <span aria-hidden="true"></span> <span className="nav-link__text">Marketplace</span>
            </button>
            <button
              className={`nav-link ${page === "leaderboard" ? "is-active" : ""}`}
              onClick={() => onNavigate("leaderboard")}
              title="Leaderboard"
            >
              <span aria-hidden="true"></span> <span className="nav-link__text">Leaderboard</span>
            </button>
            {isAdmin && (
              <button
                className={`nav-link ${page === "admin" ? "is-active" : ""}`}
                onClick={() => onNavigate("admin")}
                title="Admin"
              >
                <span aria-hidden="true"></span> <span className="nav-link__text">Admin</span>
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
        <button className={`tabbar__item ${page === "coinflip" ? "is-active" : ""}`} onClick={() => onNavigate("coinflip")}>
          <span className="tabbar__icon"></span>
          <span>Coinflip</span>
        </button>
        <button className={`tabbar__item ${page === "wheel" ? "is-active" : ""}`} onClick={() => onNavigate("wheel")}>
          <span className="tabbar__icon"></span>
          <span>Wheel</span>
        </button>
        <button className={`tabbar__item ${page === "crash" ? "is-active" : ""}`} onClick={() => onNavigate("crash")}>
          <span className="tabbar__icon">🚀</span>
          <span>Crash</span>
        </button>
        <button className={`tabbar__item ${page === "market" ? "is-active" : ""}`} onClick={() => onNavigate("market")}>
          <span className="tabbar__icon"></span>
          <span>Market</span>
        </button>
        <button
          className={`tabbar__item ${page === "leaderboard" ? "is-active" : ""}`}
          onClick={() => onNavigate("leaderboard")}
        >
          <span className="tabbar__icon"></span>
          <span>Ranks</span>
        </button>
        {loggedIn ? (
          <button className="tabbar__item" onClick={onOpenInventory}>
            <span className="tabbar__icon">🎒</span>
            <span>Inventory</span>
          </button>
        ) : (
          <button className="tabbar__item" onClick={onLogin}>
            <span className="tabbar__icon">👤</span>
            <span>Login</span>
          </button>
        )}
        {isAdmin && (
          <button className={`tabbar__item ${page === "admin" ? "is-active" : ""}`} onClick={() => onNavigate("admin")}>
            <span className="tabbar__icon">🛠</span>
            <span>Admin</span>
          </button>
        )}
      </nav>
    </>
  );
}