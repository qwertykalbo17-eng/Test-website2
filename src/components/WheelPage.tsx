import { memo, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useCoin } from "../coin";
import type { WheelState, WheelTarget } from "../types";
import { img } from "../utils";

interface Props {
  state: WheelState | null;
  /** server clock minus this device's clock (ms) */
  offset: number;
  coins: number;
  loggedIn: boolean;
  busy: boolean;
  onLogin: () => void;
  onBet: (target: WheelTarget, amount: number) => Promise<void>;
  /** the round is over: reload the wheel and your coins */
  onRoundEnd: () => void;
  /** reload the wheel (used to fetch the result as soon as betting closes) */
  onRefresh: () => void;
  /** place several bets in the current round (used by Repeat / Auto). Resolves true when they all went through. */
  onRepeat: (bets: [WheelTarget, number][]) => Promise<boolean>;
}

const TARGETS: WheelTarget[] = ["2x", "3x", "5x", "10x", "coinflip", "bonus"];

const LABEL: Record<WheelTarget, string> = {
  "2x": "2X",
  "3x": "3X",
  "5x": "5X",
  "10x": "10X",
  coinflip: "COINFLIP",
  bonus: "BONUS",
};

/** Same chances as the database, only used to make the strip look natural. */
const WEIGHTS: [WheelTarget, number][] = [
  ["2x", 37.5],
  ["3x", 25],
  ["5x", 16],
  ["10x", 9],
  ["coinflip", 7.5],
  ["bonus", 5],
];

const WEIGHT_TOTAL = WEIGHTS.reduce((sum, [, w]) => sum + w, 0);

const BONUS_MIN = 11;
const BONUS_MAX = 99;

const COUNT = 62;
const START = 7;
const RES = 52;
const GAP = 8;

const SPIN_DELAY = 2000;
const BONUS_ANIM = 5500;

function mulberry32(seed: number) {
  let a = seed >>> 0;

  return () => {
    a = (a + 0x6d2b79f5) >>> 0;

    let t = a;

    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted(r: number): WheelTarget {
  let x = r * WEIGHT_TOTAL;

  for (const [t, w] of WEIGHTS) {
    if (x < w) return t;

    x -= w;
  }

  return "2x";
}

const easeOut = (t: number) =>
  1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 4);

const easeInOutCubic = (t: number) => {
  const c = Math.min(Math.max(t, 0), 1);

  return c < 0.5
    ? 4 * c * c * c
    : 1 - Math.pow(-2 * c + 2, 3) / 2;
};

function fmt(n: number) {
  return Math.floor(n).toLocaleString("en-US");
}

/* ---------- last bet (for Repeat / Auto) ---------- */

type Bets = Partial<Record<WheelTarget, number>>;

const LAST_KEY = "bloxybet.wheel.last";
const CUR_KEY = "bloxybet.wheel.cur";

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: Repeat just won't survive a reload */
  }
}

const betList = (b: Bets): [WheelTarget, number][] =>
  TARGETS.filter((t) => (b[t] ?? 0) > 0).map((t) => [t, b[t] as number]);

/* ---------- best multiplier of the last 100 rounds ---------- */

const bestText = (m: number | null) => (m ? `Highest in last 100: ${m}x` : "Highest in last 100: —");

/* ---------- icons ---------- */

function Icon({ kind }: { kind: WheelTarget }) {
  if (kind === "2x" || kind === "5x") {
    return (
      <svg
        viewBox="0 0 32 32"
        className="wicon"
        aria-hidden="true"
      >
        <path
          d="M3 9.5h20.5l3 3.2v4.3h-6.3l-1.7 7.6h-5.4l1.4-7.6H9.7L8 19.6 3 17.2z"
          fill="currentColor"
        />
      </svg>
    );
  }

  if (kind === "3x" || kind === "10x") {
    return (
      <svg
        viewBox="0 0 32 32"
        className="wicon"
        aria-hidden="true"
      >
        <path
          d="M28 4 L17.8 19.8 L12.2 14.2 Z"
          fill="currentColor"
        />

        <path
          d="M10.5 12.5 L19.5 21.5"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />

        <path
          d="M15 17 L6.5 25.5"
          stroke="currentColor"
          strokeWidth="3.6"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    );
  }

  if (kind === "bonus") {
    return (
      <svg
        viewBox="0 0 32 32"
        className="wicon"
        aria-hidden="true"
      >
        <path
          d="M16 3l3.8 8.2 8.9 1-6.6 6 1.9 8.8L16 22.5 8 27l1.9-8.8-6.6-6 8.9-1z"
          fill="currentColor"
        />
      </svg>
    );
  }

  return (
    <img
      className="wicon wicon--img"
      src={img("heads.webp")}
      alt=""
    />
  );
}

function PeopleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      aria-hidden="true"
    >
      <path
        d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm7 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM9 13c-3 0-6 1.5-6 4v2h12v-2c0-2.5-3-4-6-4zm7 0c-.4 0-.8 0-1.2.1 1.4 1 2.2 2.3 2.2 3.9v2h4v-2c0-2.3-2.4-4-5-4z"
        fill="currentColor"
      />
    </svg>
  );
}

/* ---------- the strip ---------- */

const Strip = memo(function Strip({
  tiles,
  tile,
  winIndex,
  trackRef,
}: {
  tiles: WheelTarget[];
  tile: number;
  winIndex: number | null;
  trackRef: RefObject<HTMLDivElement>;
}) {
  return (
    <div
      className="wstrip__track"
      ref={trackRef}
      style={{ gap: GAP }}
    >
      {tiles.map((t, i) => (
        <div
          key={i}
          className={`wtile wtile--${t} ${
            winIndex === i
              ? "is-win"
              : winIndex !== null
                ? "is-dim"
                : ""
          }`}
          style={{
            width: tile,
            height: tile,
          }}
        >
          <Icon kind={t} />

          <span className="wtile__label">
            {t === "bonus"
              ? "BONUS"
              : t === "coinflip"
                ? "FLIP"
                : LABEL[t]}
          </span>
        </div>
      ))}
    </div>
  );
});

/* ---------- the page ---------- */

export default function WheelPage({
  state,
  offset,
  coins,
  loggedIn,
  busy,
  onLogin,
  onBet,
  onRoundEnd,
  onRefresh,
  onRepeat,
}: Props) {
  const coin = useCoin();

  const [amount, setAmount] = useState("");
  const [clock, setClock] = useState(Date.now());
  const [width, setWidth] = useState(720);

  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const coinRef = useRef<HTMLDivElement>(null);

  const offsetRef = useRef(offset);
  offsetRef.current = offset;

  const [lastOutcome, setLastOutcome] = useState<{
    id: number;
    result: WheelTarget;
    mult: number;
    bet: number;
    won: number;
  } | null>(null);

  const reported = useRef(0);

  const tile = width < 560 ? 72 : 80;
  const step = tile + GAP;

  useEffect(() => {
    const t = setInterval(
      () => setClock(Date.now()),
      200
    );

    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const el = viewportRef.current;

    if (!el) return;

    const measure = () =>
      setWidth(el.clientWidth || 720);

    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);

    return () => ro.disconnect();
  }, []);

  const now = clock + offset;
  const roundId = state?.id ?? 0;

  const { tiles, jitter } = useMemo(() => {
    const rng = mulberry32(
      roundId * 2654435761 + 12345
    );

    const list: WheelTarget[] = Array.from(
      { length: COUNT },
      () => pickWeighted(rng())
    );

    const j = (rng() - 0.5) * 0.6;

    return {
      tiles: list,
      jitter: j,
    };
  }, [roundId]);

  const bettingEnds =
    state?.betting_ends_at ?? 0;

  const spinStarts =
    bettingEnds + SPIN_DELAY;

  const spinEnds =
    state?.spin_ends_at ?? 0;

  const roundEnds =
    state?.ends_at ?? 0;

  const phase:
    | "loading"
    | "betting"
    | "locked"
    | "spinning"
    | "reveal"
    | "ended" =
    !state
      ? "loading"
      : now < bettingEnds
        ? "betting"
        : now < spinStarts
          ? "locked"
          : now < spinEnds
            ? "spinning"
            : now < roundEnds
              ? "reveal"
              : "ended";

  const spun =
    phase === "reveal" ||
    phase === "ended";

  const betsClosed =
    state != null &&
    now >= bettingEnds;

  const result =
    state?.result ?? null;

  const boostTarget =
    betsClosed
      ? (state?.boost_target ?? null)
      : null;

  const boostMult =
    betsClosed &&
    state?.boost_mult &&
    state.boost_mult > 1
      ? state.boost_mult
      : 1;

  const shownTiles = useMemo(() => {
    if (!result) return tiles;

    const copy = tiles.slice();
    copy[RES] = result;

    return copy;
  }, [tiles, result]);

  const hasBonus =
    result === "bonus" ||
    result === "coinflip";

  const resultBoost =
    result &&
    boostTarget === result
      ? boostMult
      : 1;

  const effectiveMult =
    state?.mult != null
      ? state.mult * resultBoost
      : null;

  useEffect(() => {
    if (!state) return;

    const track =
      trackRef.current;

    if (!track) return;

    const center = (i: number) =>
      i * step + tile / 2;

    const startX =
      width / 2 -
      center(START);

    const endX =
      width / 2 -
      (center(RES) +
        jitter * tile);

    let raf = 0;

    let timer:
      | ReturnType<typeof setTimeout>
      | undefined;

    const frame = () => {
      const n =
        Date.now() +
        offsetRef.current;

      let x = startX;

      if (n >= spinStarts) {
        const t =
          (n - spinStarts) /
          Math.max(
            1,
            spinEnds -
              spinStarts
          );

        x =
          startX +
          (endX - startX) *
            easeOut(t);
      }

      track.style.transform =
        `translate3d(${x}px,0,0)`;

      if (n < spinStarts) {
        timer = setTimeout(
          frame,
          Math.min(
            500,
            Math.max(
              30,
              spinStarts - n
            )
          )
        );
      } else if (
        n < spinEnds
      ) {
        raf =
          requestAnimationFrame(
            frame
          );
      }
    };

    frame();

    return () => {
      cancelAnimationFrame(raf);

      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [
    state,
    step,
    tile,
    width,
    jitter,
    spinStarts,
    spinEnds,
  ]);

  useEffect(() => {
    if (
      !spun ||
      result !== "coinflip"
    ) {
      return;
    }

    const el =
      coinRef.current;

    if (!el) return;

    const targetOffset =
      state?.mult === 25
        ? 180
        : 0;

    let raf = 0;

    const tickCoin = () => {
      const n =
        Date.now() +
        offsetRef.current;

      const elapsed =
        Math.max(
          0,
          n - spinEnds
        );

      const p =
        Math.min(
          1,
          elapsed /
            BONUS_ANIM
        );

      const eased =
        easeInOutCubic(p);

      const angle =
        360 * 6 * eased +
        targetOffset *
          eased;

      const lift =
        Math.sin(
          p * Math.PI
        ) * 14;

      const scale =
        1 +
        Math.sin(
          p * Math.PI
        ) * 0.14;

      el.style.transform =
        `translate3d(0, ${-lift}px, 0) scale(${scale}) rotateY(${angle}deg)`;

      if (p < 1) {
        raf =
          requestAnimationFrame(
            tickCoin
          );
      } else {
        el.style.transform =
          `translate3d(0, 0, 0) scale(1) rotateY(${360 * 6 + targetOffset}deg)`;
      }
    };

    raf =
      requestAnimationFrame(
        tickCoin
      );

    return () =>
      cancelAnimationFrame(
        raf
      );
  }, [
    spun,
    result,
    state?.mult,
    spinEnds,
  ]);

  useEffect(() => {
    if (!state) return;

    const t1 = setTimeout(
      onRefresh,
      Math.max(
        0,
        state.betting_ends_at -
          (
            Date.now() +
            offsetRef.current
          )
      ) + 120
    );

    const t2 = setTimeout(
      () => onRefresh(),
      Math.max(
        0,
        state.betting_ends_at -
          (
            Date.now() +
            offsetRef.current
          )
      ) + 700
    );

    const t3 = setTimeout(
      onRoundEnd,
      Math.max(
        0,
        state.ends_at -
          (
            Date.now() +
            offsetRef.current
          )
      ) + 400
    );

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state?.id,
    state?.betting_ends_at,
    state?.ends_at,
  ]);

  useEffect(() => {
    if (
      !state ||
      !result ||
      effectiveMult == null
    ) {
      return;
    }

    if (
      phase !== "reveal" ||
      reported.current === state.id
    ) {
      return;
    }

    reported.current =
      state.id;

    const bet =
      Object.values(
        state.mine
      ).reduce(
        (a, b) =>
          a + (b ?? 0),
        0
      );

    const won =
      (state.mine[result] ??
        0) *
      effectiveMult;

    setLastOutcome({
      id: state.id,
      result,
      mult: effectiveMult,
      bet,
      won,
    });
  }, [
    state,
    phase,
    result,
    effectiveMult,
  ]);

  const amountNum =
    Math.floor(
      Number(
        amount.replace(
          /[^0-9]/g,
          ""
        )
      ) || 0
    );

  const canBet =
    phase === "betting";

  /* ---------- Repeat last bet / Auto bet ---------- */

  const [lastBets, setLastBets] = useState<Bets>(() => readJson<Bets>(LAST_KEY) ?? {});
  const [auto, setAuto] = useState(false);
  const [autoMsg, setAutoMsg] = useState("");
  const autoRound = useRef(0);
  const placing = useRef(false);
  const mineKey = JSON.stringify(state?.mine ?? {});

  // keep what you bet in this round, and when a new round starts it becomes "your last bet"
  useEffect(() => {
    if (!state) return;
    const cur = readJson<{ id: number; mine: Bets }>(CUR_KEY);
    if (cur && cur.id !== state.id && betList(cur.mine).length) {
      writeJson(LAST_KEY, cur.mine);
      setLastBets(cur.mine);
      try {
        localStorage.removeItem(CUR_KEY);
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.id]);

  useEffect(() => {
    if (state && betList(state.mine).length) writeJson(CUR_KEY, { id: state.id, mine: state.mine });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.id, mineKey]);

  const lastList = betList(lastBets);
  const lastTotal = lastList.reduce((a, [, n]) => a + n, 0);
  const betThisRound = betList(state?.mine ?? {}).length > 0;

  async function repeat(): Promise<boolean> {
    if (!lastList.length || placing.current) return false;
    placing.current = true;
    try {
      return await onRepeat(lastList);
    } finally {
      placing.current = false;
    }
  }

  function repeatClick() {
    if (!loggedIn) return onLogin();
    if (!canBet || busy || betThisRound) return;
    repeat();
  }

  function autoClick() {
    if (!loggedIn) return onLogin();
    if (auto) {
      setAuto(false);
      setAutoMsg("");
      return;
    }
    if (!lastList.length) {
      setAutoMsg("Place a bet first, then turn Auto on.");
      return;
    }
    setAutoMsg("");
    setAuto(true);
  }

  // Auto: at the start of every round, place your last bet once
  useEffect(() => {
    if (!auto) return;
    if (!loggedIn) {
      setAuto(false);
      return;
    }
    if (!state || phase !== "betting" || busy || placing.current) return;
    if (autoRound.current === state.id) return;

    if (betThisRound) {
      autoRound.current = state.id; // you already bet this round yourself
      return;
    }
    autoRound.current = state.id;
    if (!lastList.length) {
      setAuto(false);
      return;
    }
    if (lastTotal > coins) {
      setAuto(false);
      setAutoMsg("Auto bet stopped: not enough coins.");
      return;
    }
    repeat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, state?.id, phase, busy, mineKey, lastBets, coins, loggedIn]);

  function setAmt(n: number) {
    setAmount(
      n > 0
        ? String(
            Math.floor(n)
          )
        : ""
    );
  }

  function place(
    target: WheelTarget
  ) {
    if (!loggedIn) {
      return onLogin();
    }

    if (
      !canBet ||
      busy ||
      amountNum < 1
    ) {
      return;
    }

    onBet(
      target,
      amountNum
    );
  }

  function multLabel(
    target: WheelTarget
  ) {
    const m =
      boostTarget === target
        ? boostMult
        : 1;

    if (target === "2x")
      return `${2 * m}x`;

    if (target === "3x")
      return `${3 * m}x`;

    if (target === "5x")
      return `${5 * m}x`;

    if (target === "10x")
      return `${10 * m}x`;

    if (target === "coinflip")
      return `${7 * m}x / ${25 * m}x`;

    return `${BONUS_MIN * m}x – ${BONUS_MAX * m}x`;
  }

  const secondsLeft =
    Math.max(
      0,
      Math.ceil(
        (bettingEnds - now) /
          1000
      )
    );

  const progress =
    state
      ? Math.min(
          1,
          Math.max(
            0,
            (bettingEnds -
              now) /
              11000
          )
        )
      : 0;

  const winIndex =
    spun && result
      ? RES
      : null;

  const bonusElapsed =
    Math.max(
      0,
      now - spinEnds
    );

  const bonusDone =
    bonusElapsed >=
    BONUS_ANIM;

  let rolling:
    number | null = null;

  if (
    result === "bonus" &&
    effectiveMult != null
  ) {
    if (bonusDone) {
      rolling =
        effectiveMult;
    } else {
      const k =
        Math.floor(
          Math.sqrt(
            bonusElapsed /
              BONUS_ANIM
          ) * 36
        );

      const span =
        BONUS_MAX -
        BONUS_MIN +
        1;

      rolling =
        (
          BONUS_MIN +
          Math.floor(
            mulberry32(
              roundId *
                977 +
                k
            )() *
              span
          )
        ) *
        resultBoost;
    }
  }

  const totals =
    state?.totals ?? {};

  const mine =
    state?.mine ?? {};

  const statusText =
    phase === "loading"
      ? "Loading the wheel…"
      : phase === "betting"
        ? `Place your bets · ${secondsLeft}s`
        : phase === "locked"
          ? "Bets closed"
          : phase === "spinning"
            ? "Spinning…"
            : phase === "reveal"
              ? hasBonus &&
                !bonusDone
                ? result ===
                  "bonus"
                  ? "Bonus round!"
                  : "Coinflip bonus!"
                : `${effectiveMult}x`
              : "Next round starting…";

  return (
    <>
      <div className="wheel-top">
        <div
          className="wheel-history"
          aria-label="Previous results"
        >
          {(state?.history ??
            [])
            .slice(0, 12)
            .map((h) => (
              <span
                key={h.id}
                className={`whist whist--${h.result}`}
                title={`${LABEL[h.result]} (${h.mult}x)`}
              >
                {`${h.mult}x`}
              </span>
            ))}
        </div>

        <span className="wheel-50x">
          {bestText(state?.best_mult ?? null)}
        </span>

        <span
          className={`wheel__phase wheel__phase--${phase}`}
        >
          {statusText}
        </span>
      </div>

      <section
        className={`panel wheel ${
          boostMult === 50
            ? "is-mega"
            : ""
        }`}
      >
        <div
          className={`wstrip ${
            boostMult === 50
              ? "is-mega"
              : ""
          }`}
          ref={viewportRef}
        >
          <div className="wstrip__bar">
            <div
              className="wstrip__bar-fill"
              style={{
                width: `${progress * 100}%`,
              }}
            />
          </div>

          <div
            className="wstrip__marker"
            aria-hidden="true"
          />

          <div
            className="wstrip__line"
            aria-hidden="true"
          />

          <div
            className="wstrip__fade wstrip__fade--l"
            aria-hidden="true"
          />

          <div
            className="wstrip__fade wstrip__fade--r"
            aria-hidden="true"
          />

          <Strip
            key={roundId}
            tiles={shownTiles}
            tile={tile}
            winIndex={winIndex}
            trackRef={trackRef}
          />
        </div>

        {spun && hasBonus && (
          <div
            className={`wbonus wbonus--${result} ${
              bonusDone
                ? "is-done"
                : ""
            }`}
          >
            {result === "bonus" ? (
              <>
                <div className="wbonus__title">
                  BONUS ROUND
                </div>

                <div className="wbonus__mult">
                  {rolling}x
                </div>
              </>
            ) : (
              <>
                <div className="wbonus__title">
                  COINFLIP BONUS · Heads{" "}
                  {7 * resultBoost}x · Tails{" "}
                  {25 * resultBoost}x
                </div>

                <div
                  ref={coinRef}
                  className="wbonus__coin"
                  style={{
                    transform: `rotateY(${
                      state?.mult === 25
                        ? 180
                        : 0
                    }deg)`,
                  }}
                >
                  <img
                    src={img("heads.webp")}
                    alt="Heads"
                    className="wbonus__face"
                  />

                  <img
                    src={img("tails.webp")}
                    alt="Tails"
                    className="wbonus__face wbonus__face--back"
                  />
                </div>

                <div className="wbonus__mult">
                  {bonusDone
                    ? `${effectiveMult}x`
                    : "…"}
                </div>
              </>
            )}
          </div>
        )}

        {lastOutcome &&
          (
            phase === "reveal" ||
            phase === "ended"
          ) &&
          lastOutcome.id ===
            roundId &&
          lastOutcome.bet > 0 &&
          (
            !hasBonus ||
            bonusDone
          ) && (
            <div
              className={`wheel__outcome ${
                lastOutcome.won >
                0
                  ? "is-win"
                  : "is-lose"
              }`}
            >
              {lastOutcome.won >
              0 ? (
                <>
                  You won{" "}
                  <b>
                    {coin}{" "}
                    {fmt(
                      lastOutcome.won
                    )}
                  </b>
                </>
              ) : (
                <>
                  No win this round · you
                  bet{" "}
                  <b>
                    {coin}{" "}
                    {fmt(
                      lastOutcome.bet
                    )}
                  </b>
                </>
              )}
            </div>
          )}
      </section>

      <section
        className={`panel wheel-bet ${
          boostMult === 50
            ? "is-mega"
            : ""
        }`}
      >
        <div className="wheel-bet__amount">
          <div className="wheel-bet__input">
            <span className="wheel-bet__coin">
              {coin}
            </span>

            <input
              className="input"
              inputMode="numeric"
              placeholder="Bet amount"
              value={amount}
              onChange={(e) =>
                setAmount(
                  e.target.value.replace(
                    /[^0-9]/g,
                    ""
                  )
                )
              }
            />
          </div>

          <div className="wheel-bet__chips">
            <button
              className="chip-btn"
              onClick={() =>
                setAmt(
                  amountNum +
                    10
                )
              }
            >
              +10
            </button>

            <button
              className="chip-btn"
              onClick={() =>
                setAmt(
                  amountNum +
                    100
                )
              }
            >
              +100
            </button>

            <button
              className="chip-btn"
              onClick={() =>
                setAmt(
                  amountNum +
                    1000
                )
              }
            >
              +1K
            </button>

            <button
              className="chip-btn"
              onClick={() =>
                setAmt(
                  amountNum / 2
                )
              }
            >
              ½
            </button>

            <button
              className="chip-btn"
              onClick={() =>
                setAmt(
                  amountNum * 2
                )
              }
            >
              2×
            </button>

            <button
              className="chip-btn"
              onClick={() =>
                setAmt(coins)
              }
            >
              Max
            </button>

            <button
              className="chip-btn chip-btn--clear"
              onClick={() =>
                setAmt(0)
              }
            >
              Clear
            </button>

            <button
              className="chip-btn chip-btn--repeat"
              disabled={!!loggedIn && (!canBet || busy || betThisRound || lastList.length === 0)}
              onClick={repeatClick}
              title={
                lastList.length
                  ? `Repeat your last bet: ${lastList.map(([t, n]) => `${LABEL[t]} ${fmt(n)}`).join(", ")}`
                  : "No previous bet yet"
              }
            >
              ↻ Repeat{lastTotal > 0 ? ` · ${fmt(lastTotal)}` : ""}
            </button>

            <button
              className={`chip-btn chip-btn--auto ${auto ? "is-on" : ""}`}
              onClick={autoClick}
              title="Repeat your last bet automatically at the start of every round"
            >
              Auto {auto ? "ON" : "OFF"}
            </button>
          </div>
          {autoMsg && <span className="wheel-bet__note">{autoMsg}</span>}
        </div>

        <div className="wheel-bets">
          {TARGETS.map((t) => {
            const tot =
              totals[t];

            const my =
              mine[t] ?? 0;

            const win =
              spun &&
              result === t;

            const isBoosted =
              boostTarget === t &&
              boostMult > 1;

            return (
              <div
                key={t}
                className={`wbet wbet--${t} ${
                  isBoosted
                    ? `wbet--boost-${boostMult}`
                    : ""
                } ${
                  win
                    ? "is-win"
                    : ""
                } ${
                  spun &&
                  !win
                    ? "is-dim"
                    : ""
                }`}
              >
                <div className="wbet__head">
                  <div
                    className={`wbet__icon wtile--${t}`}
                  >
                    <Icon
                      kind={t}
                    />
                  </div>

                  <div className="wbet__name">
                    <span className="wbet__title-row">
                      {LABEL[t]}

                      {isBoosted && (
                        <span
                          className={`wbet__boost-pill wbet__boost-pill--${boostMult}`}
                        >
                          {`x${boostMult}`}
                        </span>
                      )}
                    </span>

                    <small
                      className={
                        isBoosted
                          ? "is-boosted-mult"
                          : ""
                      }
                    >
                      {multLabel(t)}
                    </small>
                  </div>

                  <div className="wbet__stats">
                    <span title="Coins bet by everyone">
                      <i className="wbet__coin">
                        {coin}
                      </i>{" "}
                      {fmt(
                        tot?.coins ??
                          0
                      )}
                    </span>

                    <span title="Players">
                      <PeopleIcon />{" "}
                      {tot?.players ??
                        0}
                    </span>
                  </div>
                </div>

                <button
                  className={`wbet__bar ${
                    canBet
                      ? "is-open"
                      : ""
                  }`}
                  disabled={
                    !!loggedIn &&
                    (
                      !canBet ||
                      busy
                    )
                  }
                  onClick={() =>
                    place(t)
                  }
                >
                  <span className="wbet__txt">
                    {!loggedIn
                      ? "LOG IN TO BET"
                      : canBet
                        ? "PLACE A BET"
                        : "BETS CLOSED"}
                  </span>

                  <span className="wbet__mine">
                    <i className="wbet__coin">
                      {coin}
                    </i>{" "}
                    {fmt(my)}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}