import { useEffect, useRef, useState } from "react";
import {
  buyItems,
  callBot,
  cancelMatch,
  crashBet,
  crashCashout,
  createMatch,
  joinMatch,
  markSeen,
  sellItems,
  wheelBet,
  wheelSetArrow,
} from "./api";
import { CoinContext } from "./coin";
import AdminPage from "./components/AdminPage";
import AuthModal from "./components/AuthModal";
import BattleModal from "./components/BattleModal";
import ChristmasDecor from "./components/ChristmasDecor";
import CrashPage from "./components/CrashPage";
import HalloweenDecor from "./components/HalloweenDecor";
import HistoryModal from "./components/HistoryModal";
import InventoryModal from "./components/InventoryModal";
import InventoryViewModal from "./components/InventoryViewModal";
import Leaderboard from "./components/Leaderboard";
import MarketPage, { type CartLine } from "./components/MarketPage";
import ValuesPage from "./components/ValuesPage";
import MatchList from "./components/MatchList";
import MatchViewModal from "./components/MatchViewModal";
import WheelPage from "./components/WheelPage";
import Navbar, { type Page } from "./components/Navbar";
import { useAuth } from "./hooks/useAuth";
import { useCrash } from "./hooks/useCrash";
import { useItems } from "./hooks/useItems";
import { useMatchById } from "./hooks/useMatchById";
import { useMatches } from "./hooks/useMatches";
import { useUserData } from "./hooks/useUserData";
import { useWheel } from "./hooks/useWheel";
import type { InvItem, Match, Side, WheelTarget } from "./types";
import { generateBotItems, sumValue } from "./utils";

/*
 * =========================================================
 * ACTIVE THEME
 * =========================================================
 *
 * Available themes:
 *
 * "normal"
 * "halloween"
 * "christmas"
 *
 * Change ONLY the value below to switch themes.
 */

type Theme = "normal" | "halloween" | "christmas";

// The "as Theme" lets TypeScript accept the comparisons below for every theme
// (without it, `npm run build` fails with "types have no overlap").
const ACTIVE_THEME = "normal" as Theme;

/** The coin icon changes with the theme: snowflake at Christmas, candy at Halloween. */
const COIN_ICON = ACTIVE_THEME === "christmas" ? "❄️" : ACTIVE_THEME === "halloween" ? "🍬" : "🪙";

/** A finished flip you never watched is replayed only if it ended less than this long ago. */
const REPLAY_WINDOW_MS = 2 * 60 * 1000;

export default function App() {
  /*
   * Apply the selected theme to the entire document.
   */
  useEffect(() => {
    document.documentElement.dataset.theme = ACTIVE_THEME;
  }, []);

  const { user, ready, username, login, signup, logout } = useAuth();
  const userId = user?.id ?? null;
  const { items: catalog, refresh: refreshCatalog } = useItems(true);
  const { data, loading, refresh: refreshProfile, hold, release } = useUserData(user);
  const { open, recent, unseen, counts, refresh: refreshMatches } = useMatches(userId);

  const [page, setPage] = useState<Page>("coinflip");
  const [crashAuto, setCrashAuto] = useState(false);
  const wheel = useWheel(page === "wheel");
  // while Auto bet is on, keep the round fresh (fast) on every page so no round is missed
  const crash = useCrash(page === "crash" || crashAuto);
  /** the bet Auto bet repeats: your last crash bet */
  const crashTemplate = useRef<{ amount: number; auto: number | null } | null>(null);
  const crashAutoTried = useRef<number | null>(null);
  const [postOpen, setPostOpen] = useState(false);
  const [joinTarget, setJoinTarget] = useState<Match | null>(null);
  const [viewInventoryOpen, setViewInventoryOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [battle, setBattle] = useState<Match | null>(null);
  // the match info window (kept live while it is open)
  const [viewSeed, setViewSeed] = useState<Match | null>(null);
  const viewed = useMatchById(viewSeed);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  // flips that were already shown (or skipped) in this tab
  const handled = useRef(new Set<string>());

  function showToast(message: string) {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  }

  /* ----- Crash Auto bet: runs on every page, not only the Crash page ----- */
  const crashMine = crash.state?.mine ?? null;
  useEffect(() => {
    // remember the bet you placed: this is what Auto bet repeats
    if (crashMine) crashTemplate.current = { amount: crashMine.amount, auto: crashMine.auto };
  }, [crashMine?.amount, crashMine?.auto]);

  useEffect(() => {
    if (!userId) setCrashAuto(false);
  }, [userId]);

  useEffect(() => {
    const s = crash.state;
    const tpl = crashTemplate.current;
    if (!crashAuto || !userId || !s || !tpl || s.mine) return;
    if (crashAutoTried.current === s.id) return;
    // only while betting is still open (small margin so the bet isn't sent as it closes)
    if (Date.now() + crash.offset >= s.betting_ends_at - 400) return;
    crashAutoTried.current = s.id;
    if (tpl.amount > data.coins) {
      setCrashAuto(false);
      showToast("Auto bet turned off: not enough coins.");
      return;
    }
    crashBet(s.id, tpl.amount, tpl.auto)
      .then(() => Promise.all([refreshProfile(), crash.refresh()]))
      .catch((e) => {
        setCrashAuto(false);
        showToast(e instanceof Error ? `Auto bet turned off: ${e.message}` : "Auto bet turned off.");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crashAuto, crash.state, crash.offset, userId, data.coins]);

  function handleCrashAutoToggle(amount: number, autoCashout: number | null) {
    if (crashAuto) {
      setCrashAuto(false);
      return;
    }
    if (!user) {
      setAuthOpen(true);
      return;
    }
    if (amount >= 1) crashTemplate.current = { amount, auto: autoCashout };
    if (!crashTemplate.current) {
      showToast("Enter a bet amount first, then turn Auto bet on.");
      return;
    }
    crashAutoTried.current = null;
    setCrashAuto(true);
  }

  /**
   * Replay flips you haven't watched yet. The result is already saved in the database,
   * so refreshing the page in the middle of a flip just plays the animation again.
   */
  useEffect(() => {
    if (!userId || battle) return;
    const next = unseen.find((m) => !handled.current.has(m.id));
    if (!next) return;

    // You are watching this match's info window: it moves on to the flip by itself.
    if (viewSeed?.id === next.id) return;

    // Someone else joined your match while you weren't watching: no pop-up, the result
    // is simply in History / Recent results. (Bot flips and flips you joined are still replayed.)
    if (next.creator_id === userId && !next.is_bot) {
      handled.current.add(next.id);
      markSeen(next.id)
        .catch(console.error)
        .finally(() => {
          refreshMatches();
          refreshProfile();
        });
      return;
    }

    const age = Date.now() - new Date(next.finished_at ?? next.created_at).getTime();
    if (age > REPLAY_WINDOW_MS) {
      // too old to be worth replaying: just mark it as seen
      handled.current.add(next.id);
      markSeen(next.id)
        .catch(console.error)
        .finally(() => {
          refreshMatches();
          refreshProfile();
        });
      return;
    }

    hold(); // keep profit / inventory frozen so the animation doesn't spoil the result
    setBattle(next);
  }, [unseen, battle, userId, viewSeed, hold, refreshMatches, refreshProfile]);

  /** Run an action once at a time and show any error from the database. */
  async function act(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Something went wrong.");
      setJoinTarget(null);
      refreshMatches();
      refreshProfile();
    } finally {
      setBusy(false);
    }
  }

  function startFlip(match: Match) {
    hold();
    setBattle(match);
  }

  async function finishBattle() {
    if (!battle) return;
    const id = battle.id;
    const hasNext = unseen.some((m) => m.id !== id && !handled.current.has(m.id));
    handled.current.add(id);
    setBattle(null);
    try {
      await markSeen(id);
    } catch (e) {
      console.error(e);
    }
    if (!hasNext) await release(); // show the new profit / inventory
    refreshMatches();
  }

  function handlePost(items: InvItem[], side: Side) {
    return act(async () => {
      const created = await createMatch(
        items.map((i) => i.id),
        side
      );
      setPostOpen(false);
      setViewSeed(created); // show the match info right away
      await Promise.all([refreshProfile(), refreshMatches()]);
    });
  }

  function handleJoin(items: InvItem[]) {
    const target = joinTarget;
    if (!target) return Promise.resolve();
    return act(async () => {
      const finished = await joinMatch(
        target.id,
        items.map((i) => i.id)
      );
      setJoinTarget(null);
      startFlip(finished);
      refreshMatches();
    });
  }

  function handleCallBot(match: Match) {
    return act(async () => {
      const botItems = generateBotItems(match.creator_total, catalog);
      if (botItems.length === 0) throw new Error("The bot couldn't find a fair bet for this match.");
      const finished = await callBot(
        match.id,
        botItems.map((i) => i.name)
      );
      setViewSeed(null);
      startFlip(finished);
      refreshMatches();
    });
  }

  function handleCancel(match: Match) {
    return act(async () => {
      await cancelMatch(match.id);
      setViewSeed(null);
      await Promise.all([refreshProfile(), refreshMatches()]);
    });
  }

  /** Buy several items at once. Resolves true when it worked, so the cart can be cleared. */
  async function handleBuy(cart: CartLine[]) {
    let ok = false;
    await act(async () => {
      const names = cart.flatMap((l) => Array.from({ length: l.qty }, () => l.name));
      await buyItems(names);
      ok = true;
      await Promise.all([refreshProfile(), refreshCatalog()]);
    });
    if (!ok) refreshCatalog(); // stock may have changed
    return ok;
  }

  function handleSell(items: InvItem[]) {
    return act(async () => {
      await sellItems(items.map((i) => i.id));
      await refreshProfile();
    });
  }

  function handleWheelBet(target: WheelTarget, amount: number) {
    return act(async () => {
      const roundId = wheel.state?.id;
      if (!roundId) throw new Error("The wheel is loading, try again in a second.");
      await wheelBet(roundId, target, amount);
      await Promise.all([refreshProfile(), wheel.refresh()]);
    });
  }

  /** Repeat / Auto bet: place several wheel bets at once. Resolves true when they all went through. */
  async function handleWheelRepeat(bets: [WheelTarget, number][]) {
    let ok = false;
    await act(async () => {
      const roundId = wheel.state?.id;
      if (!roundId) throw new Error("The wheel is loading, try again in a second.");
      const total = bets.reduce((sum, [, n]) => sum + n, 0);
      if (total > data.coins) throw new Error("Not enough coins to repeat your last bet.");
      for (const [target, amount] of bets) await wheelBet(roundId, target, amount);
      ok = true;
      await Promise.all([refreshProfile(), wheel.refresh()]);
    });
    return ok;
  }

  function handleCrashBet(amount: number, autoCashout: number | null) {
    return act(async () => {
      const roundId = crash.state?.id;
      if (!roundId) throw new Error("The game is loading, try again in a second.");
      await crashBet(roundId, amount, autoCashout);
      await Promise.all([refreshProfile(), crash.refresh()]);
    });
  }

  function handleCrashCashout() {
    return act(async () => {
      const roundId = crash.state?.id;
      if (!roundId) return;
      await crashCashout(roundId);
      await Promise.all([refreshProfile(), crash.refresh()]);
    });
  }

  if (!ready) return <div className="splash">Loading…</div>;

  /** Guests can look around; anything that needs an account opens the login popup. */
  function requireLogin(action: () => void) {
    if (user) action();
    else setAuthOpen(true);
  }

  // items locked in an open match can't be used again
  const available = data.inventory.filter((i) => !i.locked);

  return (
    <CoinContext.Provider value={COIN_ICON}>
      {ACTIVE_THEME === "halloween" && <HalloweenDecor />}

      {ACTIVE_THEME === "christmas" && <ChristmasDecor />}

      <Navbar
        page={page}
        onNavigate={setPage}
        username={user ? username : null}
        isAdmin={data.isAdmin}
        coins={data.coins}
        coinIcon={COIN_ICON}
        inventoryValue={sumValue(data.inventory)}
        onOpenInventory={() => setViewInventoryOpen(true)}
        onOpenMarket={() => setPage("market")}
        onLogin={() => setAuthOpen(true)}
        onLogout={logout}
      />

      <main className="container">
        {page === "crash" ? (
          <CrashPage
            state={crash.state}
            offset={crash.offset}
            coins={data.coins}
            loggedIn={!!user}
            busy={busy}
            onLogin={() => setAuthOpen(true)}
            onBet={handleCrashBet}
            onCashout={handleCrashCashout}
            autoBet={crashAuto}
            onToggleAutoBet={handleCrashAutoToggle}
            onRefresh={crash.refresh}
            onRoundEnd={() => {
              crash.refresh();
              refreshProfile();
            }}
          />
        ) : page === "wheel" ? (
          <WheelPage
            state={wheel.state}
            offset={wheel.offset}
            coins={data.coins}
            loggedIn={!!user}
            busy={busy}
            onLogin={() => setAuthOpen(true)}
            onBet={handleWheelBet}
            onChooseArrow={(roundId, arrow) => wheelSetArrow(roundId, arrow)}
            onRepeat={handleWheelRepeat}
            onRefresh={wheel.refresh}
            onRoundEnd={() => {
              wheel.refresh();
              refreshProfile();
            }}
          />
        ) : page === "values" ? (
          <ValuesPage catalog={catalog} isAdmin={data.isAdmin} onSaved={refreshCatalog} onError={showToast} />
        ) : page === "market" ? (
          <MarketPage
            catalog={catalog}
            inventory={available}
            coins={data.coins}
            loggedIn={!!user}
            busy={busy}
            onLogin={() => setAuthOpen(true)}
            onBuy={handleBuy}
            onSell={handleSell}
            onRefresh={refreshCatalog}
          />
        ) : page === "admin" && data.isAdmin ? (
          <AdminPage
            catalog={catalog}
            onItemsChanged={refreshCatalog}
            onError={showToast}
          />
        ) : page !== "leaderboard" ? (
          <>
            <div className="hero">
              <div>
                <h1>Coinflip</h1>
                <p className="muted">
                  {!user
                    ? "Log in to post or join a match."
                    : loading
                      ? "Loading your inventory…"
                      : `${data.inventory.length} items in your inventory`}
                </p>
              </div>
              <div className="hero__actions">
                <button className="btn btn--ghost" onClick={() => requireLogin(() => setHistoryOpen(true))}>
                  History
                </button>
                <button className="btn btn--ghost" onClick={() => setPage("market")}>
                  Marketplace
                </button>
                <button className="btn btn--primary" onClick={() => requireLogin(() => setPostOpen(true))}>
                  Post match
                </button>
              </div>
            </div>

            <MatchList
              open={open}
              recent={recent}
              counts={counts}
              userId={user?.id ?? ""}
              busy={busy}
              onJoin={(m) => requireLogin(() => setJoinTarget(m))}
              onCallBot={handleCallBot}
              onView={setViewSeed}
            />
          </>
        ) : (
          <Leaderboard
            me={user ? { username, profit: data.profit, totalWagered: data.totalWagered } : null}
          />
        )}
      </main>

      <InventoryModal
        open={postOpen || !!joinTarget}
        inventory={available}
        match={joinTarget}
        busy={busy}
        onClose={() => {
          setPostOpen(false);
          setJoinTarget(null);
        }}
        onConfirm={(items, side) => (joinTarget ? handleJoin(items) : handlePost(items, side))}
      />
      <InventoryViewModal
        open={viewInventoryOpen}
        inventory={data.inventory}
        onClose={() => setViewInventoryOpen(false)}
      />
      <HistoryModal open={historyOpen && !!user} userId={user?.id ?? ""} onClose={() => setHistoryOpen(false)} />

      <AuthModal open={authOpen && !user} onClose={() => setAuthOpen(false)} onLogin={login} onSignup={signup} />

      {viewSeed && viewed && user && (
        <MatchViewModal
          key={viewSeed.id}
          match={viewed}
          userId={user.id}
          busy={busy}
          onClose={() => setViewSeed(null)}
          onJoin={(m) => {
            setViewSeed(null);
            setJoinTarget(m);
          }}
          onCallBot={handleCallBot}
          onCancel={handleCancel}
          onFlip={(m) => {
            setViewSeed(null);
            startFlip(m);
          }}
        />
      )}

      {viewSeed && viewed && !user && (
        <MatchViewModal
          key={viewSeed.id}
          match={viewed}
          userId=""
          busy={busy}
          onClose={() => setViewSeed(null)}
          onJoin={() => {
            setViewSeed(null);
            setAuthOpen(true);
          }}
          onCallBot={() => undefined}
          onCancel={() => undefined}
          onFlip={() => undefined}
        />
      )}

      {battle && user && <BattleModal key={battle.id} match={battle} userId={user.id} onFinish={finishBattle} />}

      {toast && (
        <div className="toast" role="alert">
          {toast}
        </div>
      )}
    </CoinContext.Provider>
  );
}