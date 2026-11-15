import { formatValue } from "../utils";

export type Page = "coinflip" | "battles" | "leaderboard" | "admin";

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
            >
              🪙 Coinflip
            </button>
            <button
              className={`nav-link ${page === "battles" ? "is-active" : ""}`}
              onClick={() => onNavigate("battles")}
            >
              📦 Case Battles
            </button>
            <button
              className={`nav-link ${page === "leaderboard" ? "is-active" : ""}`}
              onClick={() => onNavigate("leaderboard")}
            >
              🏆 Leaderboard
            </button>
            {isAdmin && (
              <button
                className={`nav-link ${page === "admin" ? "is-active" : ""}`}
                onClick={() => onNavigate("admin")}
              >
                🛠 Admin
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
          <span className="tabbar__icon">🪙</span>
          <span>Coinflip</span>
        </button>
        <button className={`tabbar__item ${page === "battles" ? "is-active" : ""}`} onClick={() => onNavigate("battles")}>
          <span className="tabbar__icon">📦</span>
          <span>Battles</span>
        </button>
        <button
          className={`tabbar__item ${page === "leaderboard" ? "is-active" : ""}`}
          onClick={() => onNavigate("leaderboard")}
        >
          <span className="tabbar__icon">🏆</span>
          <span>Leaderboard</span>
        </button>
        {loggedIn && (
          <button className="tabbar__item" onClick={onOpenMarket}>
            <span className="tabbar__icon">🛒</span>
            <span>Market</span>
          </button>
        )}
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
