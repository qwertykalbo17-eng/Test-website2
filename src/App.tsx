import { useEffect, useRef, useState } from "react";
import {
  addBots,
  buyItems,
  callBot,
  cancelBattle,
  cancelMatch,
  createBattle,
  createMatch,
  joinBattle,
  joinMatch,
  markSeen,
  sellItems,
} from "./api";
import { CoinContext } from "./coin";
import AdminPage from "./components/AdminPage";
import AuthModal from "./components/AuthModal";
import BattleModal from "./components/BattleModal";
import BattlesPage from "./components/BattlesPage";
import CaseBattleModal from "./components/CaseBattleModal";
import ChristmasDecor from "./components/ChristmasDecor";
import CreateBattleModal from "./components/CreateBattleModal";
import HalloweenDecor from "./components/HalloweenDecor";
import HistoryModal from "./components/HistoryModal";
import InventoryModal from "./components/InventoryModal";
import InventoryViewModal from "./components/InventoryViewModal";
import Leaderboard from "./components/Leaderboard";
import MarketPage, { type CartLine } from "./components/MarketPage";
import ValuesPage from "./components/ValuesPage";
import MatchList from "./components/MatchList";
import MatchViewModal from "./components/MatchViewModal";
import Navbar, { type Page } from "./components/Navbar";
import { useAuth } from "./hooks/useAuth";
import { useBattles } from "./hooks/useBattles";
import { useCases } from "./hooks/useCases";
import { useItems } from "./hooks/useItems";
import { useMatchById } from "./hooks/useMatchById";
import { useMatches } from "./hooks/useMatches";
import { useUserData } from "./hooks/useUserData";
import type { BattleFormat, BattleMode, CaseBattle, InvItem, Match, Side } from "./types";
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
const ACTIVE_THEME = "christmas" as Theme;

/** The coin icon changes with the theme: snowflake at Christmas, candy at Halloween. */
const COIN_ICON = ACTIVE_THEME === "christmas" ? "❄️" : ACTIVE_THEME === "halloween" ? "🍬" : "🪙";

/** Case Battles are switched off for now (the nav button is greyed out). Set to true to open them again. */
const CASE_BATTLES_ENABLED = false;

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
  const { cases, refresh: refreshCases } = useCases(userId);
  const battles = useBattles();

  const [page, setPage] = useState<Page>("coinflip");
  const [postOpen, setPostOpen] = useState(false);
  const [joinTarget, setJoinTarget] = useState<Match | null>(null);
  const [viewInventoryOpen, setViewInventoryOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [createBattleOpen, setCreateBattleOpen] = useState(false);
  // a finished case battle being shown (animate = reveal the rounds one by one)
  const [viewBattle, setViewBattle] = useState<{ battle: CaseBattle; animate: boolean } | null>(null);
  const [battle, setBattle] = useState<Match | null>(null);
  // the match info window (kept live while it is open)
  const [viewSeed, setViewSeed] = useState<Match | null>(null);
  const viewed = useMatchById(viewSeed);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  // flips that were already shown (or skipped) in this tab
  const handled = useRef(new Set<string>());
  // case battles that were already shown in this tab
  const handledBattles = useRef(new Set<string>());

  function showToast(message: string) {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4500);
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

  /** A case battle you are in has finished (e.g. someone filled the last slot): show it. */
  useEffect(() => {
    if (!userId || viewBattle) return;
    const next = battles.recent.find(
      (b) =>
        !handledBattles.current.has(b.id) &&
        b.players.some((p) => p && p.user_id === userId) &&
        Date.now() - new Date(b.finished_at ?? b.created_at).getTime() < REPLAY_WINDOW_MS
    );
    if (!next) return;
    handledBattles.current.add(next.id);
    setViewBattle({ battle: next, animate: true });
    refreshProfile();
  }, [battles.recent, userId, viewBattle, refreshProfile]);

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

  function showBattle(b: CaseBattle) {
    handledBattles.current.add(b.id);
    setViewBattle({ battle: b, animate: true });
  }

  function handleCreateBattle(caseIds: string[], mode: BattleMode, format: BattleFormat) {
    return act(async () => {
      await createBattle(caseIds, mode, format);
      setCreateBattleOpen(false);
      await Promise.all([refreshProfile(), battles.refresh()]);
    });
  }

  function handleJoinBattle(b: CaseBattle, slot: number) {
    return act(async () => {
      const result = await joinBattle(b.id, slot);
      if (result.status === "finished") showBattle(result);
      await Promise.all([refreshProfile(), battles.refresh()]);
    });
  }

  function handleAddBots(b: CaseBattle) {
    return act(async () => {
      const result = await addBots(b.id);
      if (result.status === "finished") showBattle(result);
      await Promise.all([refreshProfile(), battles.refresh()]);
    });
  }

  function handleCancelBattle(b: CaseBattle) {
    return act(async () => {
      await cancelBattle(b.id);
      await Promise.all([refreshProfile(), battles.refresh()]);
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
        battlesEnabled={CASE_BATTLES_ENABLED}
        coins={data.coins}
        coinIcon={COIN_ICON}
        inventoryValue={sumValue(data.inventory)}
        onOpenInventory={() => setViewInventoryOpen(true)}
        onOpenMarket={() => setPage("market")}
        onLogin={() => setAuthOpen(true)}
        onLogout={logout}
      />

      <main className="container">
        {page === "battles" && CASE_BATTLES_ENABLED ? (
          <BattlesPage
            open={battles.open}
            recent={battles.recent}
            userId={user?.id ?? ""}
            busy={busy}
            onCreate={() => requireLogin(() => setCreateBattleOpen(true))}
            onJoin={(b, slot) => requireLogin(() => handleJoinBattle(b, slot))}
            onAddBots={handleAddBots}
            onCancel={handleCancelBattle}
            onView={(b) => setViewBattle({ battle: b, animate: false })}
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
            cases={cases}
            catalog={catalog}
            onCasesChanged={refreshCases}
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

      <CreateBattleModal
        open={createBattleOpen && !!user}
        cases={cases.filter((c) => c.active)}
        coins={data.coins}
        busy={busy}
        onClose={() => setCreateBattleOpen(false)}
        onCreate={handleCreateBattle}
      />

      {viewBattle && (
        <CaseBattleModal
          key={viewBattle.battle.id}
          battle={viewBattle.battle}
          userId={user?.id ?? ""}
          animate={viewBattle.animate}
          onClose={() => {
            setViewBattle(null);
            refreshProfile();
          }}
        />
      )}

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
