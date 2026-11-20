import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type Ref } from "react";
import { useCoin } from "../coin";
import type { CrazyArrowColor, CrazyBonusData, WheelState, WheelTarget } from "../types";
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
  /** persists the player's chosen Red/Green/Blue arrow when Crazy Time hits */
  onChooseArrow?: (roundId: number, arrow: CrazyArrowColor) => Promise<void>;
  /** the round is over: reload the wheel and your coins */
  onRoundEnd: () => void;
  /** reload the wheel (used to fetch the result as soon as betting closes) */
  onRefresh: () => void;
  /** place several bets in the current round (used by Repeat / Auto). Resolves true when they all went through. */
  onRepeat: (bets: [WheelTarget, number][]) => Promise<boolean>;
}

const TARGETS: WheelTarget[] = ["2x", "3x", "5x", "10x", "coinflip", "bonus", "crazytime"];

const LABEL: Record<WheelTarget, string> = {
  "2x": "2X",
  "3x": "3X",
  "5x": "5X",
  "10x": "10X",
  coinflip: "COINFLIP",
  bonus: "BONUS",
  crazytime: "CRAZY TIME",
};

const ARROWS: { color: CrazyArrowColor; label: string }[] = [
  { color: "red", label: "RED ARROW" },
  { color: "green", label: "GREEN ARROW" },
  { color: "blue", label: "BLUE ARROW" },
];

/** Same chances as the database, only used to make the strip look natural. */
const WEIGHTS: [WheelTarget, number][] = [
  ["2x", 36.5],
  ["3x", 24.5],
  ["5x", 15.5],
  ["10x", 8.5],
  ["coinflip", 7],
  ["bonus", 5],
  ["crazytime", 3],
];

const WEIGHT_TOTAL = WEIGHTS.reduce((sum, [, w]) => sum + w, 0);

const BONUS_MIN = 11;
const BONUS_MAX = 99;

const COUNT = 62;
const START = 7;
const RES = 52;
const GAP = 8;

const SPIN_DELAY = 2000;
const BONUS_ANIM = 7500;
/** Must match the 5000 ms in wheel_set_arrow() and wheel_state() (crazy_timing.sql). */
const CRAZY_PICK_WINDOW = 5000;
/** Upper limit only: the real length is whatever the round gives (see crazy_timing.sql). */
const CRAZY_ANIM = 60000;
/** The finished result stays on screen this long before the next round starts. */
const RESULT_HOLD = 3000;

/** How long a bonus animation plays, leaving RESULT_HOLD of the round for showing the result. */
function bonusAnimMs(result: WheelTarget | null, windowMs: number): number {
  const full = result === "crazytime" ? CRAZY_ANIM : BONUS_ANIM;
  return Math.max(1500, Math.min(full, Math.max(1000, windowMs) - RESULT_HOLD));
}

type BoardSlot =
  | { kind: "mult"; baseValue: number }
  | { kind: "double" };

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

const easeOutSoft = (t: number) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);

const easeInOutCubic = (t: number) => {
  const c = Math.min(Math.max(t, 0), 1);

  return c < 0.5
    ? 4 * c * c * c
    : 1 - Math.pow(-2 * c + 2, 3) / 2;
};

function fmt(n: number) {
  return Math.floor(n).toLocaleString("en-US");
}

/**
 * Deterministic fallback simulation matching the SQL Crazy Time logic:
 * - Board has 10x (10), 20x (5), 30x (3), 50x (2), 100x (1), and 5-10 DOUBLE slots.
 * - Pre-spin boost (`preBoostMult`) is applied to ALL multipliers before the 3 arrows spin.
 * - When an arrow hits DOUBLE, all board multipliers double and ONLY that arrow color respins.
 * - Highest multiplier across red, green, and blue is recorded in round history.
 */
function buildCrazySimulation(roundId: number, preBoostMult: number): CrazyBonusData {
  const rng = mulberry32(roundId * 4294967291 + 9001);
  const doubleCount = 5 + Math.floor(rng() * 6); // 5..10 doubles

  const rawSlots: BoardSlot[] = [
    ...Array.from({ length: 10 }, () => ({ kind: "mult" as const, baseValue: 10 })),
    ...Array.from({ length: 5 }, () => ({ kind: "mult" as const, baseValue: 20 })),
    ...Array.from({ length: 3 }, () => ({ kind: "mult" as const, baseValue: 30 })),
    ...Array.from({ length: 2 }, () => ({ kind: "mult" as const, baseValue: 50 })),
    ...Array.from({ length: 1 }, () => ({ kind: "mult" as const, baseValue: 100 })),
    ...Array.from({ length: doubleCount }, () => ({ kind: "double" as const })),
  ];

  for (let i = rawSlots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = rawSlots[i];
    rawSlots[i] = rawSlots[j];
    rawSlots[j] = tmp;
  }

  let boardDoubleFactor = 1;
  const arrowColors: CrazyArrowColor[] = ["red", "green", "blue"];
  const baseLandedByColor: Record<CrazyArrowColor, number> = { red: 10, green: 10, blue: 10 };
  const stepsByColor: Record<CrazyArrowColor, string[]> = { red: [], green: [], blue: [] };

  for (const color of arrowColors) {
    let respinsLeft = 1;
    let guard = 0;

    while (respinsLeft > 0 && guard < 5) {
      guard += 1;
      respinsLeft -= 1;

      const slotIdx = Math.floor(rng() * rawSlots.length);
      const picked = rawSlots[slotIdx];

      if (picked.kind === "double") {
        boardDoubleFactor *= 2;
        respinsLeft += 1;
        stepsByColor[color].push(`DOUBLE (x${boardDoubleFactor})`);
      } else {
        baseLandedByColor[color] = picked.baseValue;
        stepsByColor[color].push(`${picked.baseValue * preBoostMult * boardDoubleFactor}x`);
      }
    }
  }

  const redFinal = baseLandedByColor.red * preBoostMult * boardDoubleFactor;
  const greenFinal = baseLandedByColor.green * preBoostMult * boardDoubleFactor;
  const blueFinal = baseLandedByColor.blue * preBoostMult * boardDoubleFactor;

  return {
    baseMultipliers: {
      red: 10 * preBoostMult,
      green: 10 * preBoostMult,
      blue: 10 * preBoostMult,
    },
    doubleCount,
    boardDoubleFactor,
    highestMult: Math.max(redFinal, greenFinal, blueFinal),
    arrows: {
      red: { color: "red", finalMult: redFinal, steps: stepsByColor.red },
      green: { color: "green", finalMult: greenFinal, steps: stepsByColor.green },
      blue: { color: "blue", finalMult: blueFinal, steps: stepsByColor.blue },
    },
  };
}


/* ---------- Crazy Time on the main strip ---------- */

const ARROW_ORDER: CrazyArrowColor[] = ["red", "green", "blue"];
const ARROW_HEX: Record<CrazyArrowColor, string> = {
  red: "#ff5c6c",
  green: "#2ee27d",
  blue: "#38bdf8",
};

/** Share of each spin segment the strip is moving; the rest is a pause to show where it landed. */
const CRAZY_SPIN_FRAC = 0.75;
/** The strip shows the Crazy Time multipliers. The 3 arrows sit on neighbouring tiles: red, green (centre), blue. */
const CRAZY_TILES = 96;
const CRAZY_START = 7;
/** Tiles between the centre arrow and each side arrow. */
const ARROW_GAP = 2;
const CRAZY_FIRST_TRAVEL = 12;
const CRAZY_RESPIN_TRAVEL = 6;

interface CrazyPlan {
  /** for each arrow: one entry per landing (a DOUBLE is followed by a respin) */
  paths: Record<CrazyArrowColor, { double: boolean }[]>;
  /** number of spin rounds: 1 = first spin, each extra one is a respin */
  segCount: number;
  /** board double factor before segment j (index segCount = final) */
  factors: number[];
  /** arrows that hit DOUBLE in each segment */
  doubleHits: CrazyArrowColor[][];
  /** strip position (tile index under the centre marker): [start, end of spin 0, end of spin 1, ...] */
  idx: number[];
  /** what each arrow landed on, in order, e.g. ["DOUBLE (x2)", "40x"] */
  texts: Record<CrazyArrowColor, string[]>;
}

/** One tile of the Crazy Time strip: a multiplier (or a DOUBLE). */
interface CrazyTile {
  text: string;
  tier: "10" | "20" | "30" | "50" | "100" | "double";
  /** set on the tiles an arrow lands on */
  arrow?: CrazyArrowColor;
  /** the spin round that arrow lands there */
  seg?: number;
}

/** Turns the round's result (each arrow's steps, e.g. ["DOUBLE (x2)", "40x"]) into a spin plan. */
function buildCrazyPlan(bonus: CrazyBonusData): CrazyPlan {
  const paths: CrazyPlan["paths"] = { red: [], green: [], blue: [] };
  const texts: CrazyPlan["texts"] = { red: [], green: [], blue: [] };
  for (const color of ARROW_ORDER) {
    const info = bonus.arrows[color];
    const steps = info?.steps?.length ? info.steps : [`${info?.finalMult ?? 10}x`];
    texts[color] = steps;
    paths[color] = steps.map((t) => ({ double: t.startsWith("DOUBLE") }));
  }

  const segCount = Math.max(1, ...ARROW_ORDER.map((c) => paths[c].length));
  const doubleHits: CrazyArrowColor[][] = [];
  const factors = [1];
  for (let k = 0; k < segCount; k++) {
    const hits = ARROW_ORDER.filter((c) => paths[c][k]?.double);
    doubleHits.push(hits);
    factors.push(factors[k] * Math.pow(2, hits.length));
  }

    const idx = [CRAZY_START];
  for (let k = 0; k < segCount; k++) idx.push(idx[k] + (k === 0 ? CRAZY_FIRST_TRAVEL : CRAZY_RESPIN_TRAVEL));

  return { paths, segCount, factors, doubleHits, idx, texts };
}

const tierOfValue = (v: number): CrazyTile["tier"] => (v < 20 ? "10" : v < 30 ? "20" : v < 50 ? "30" : v < 100 ? "50" : "100");

/**
 * The strip while Crazy Time plays: the multipliers of the Crazy Time board (and DOUBLE tiles).
 * Deterministic per round. After every spin round the 3 tiles under the arrows are exactly what
 * the red / green / blue arrows landed on. Only an arrow that hit DOUBLE spins again.
 */
function buildCrazyTiles(roundId: number, doubleCount: number, plan: CrazyPlan | null, boost: number): CrazyTile[] {
  const rng = mulberry32(roundId * 6364136223 + 4242);
  const doubles = Math.max(1, doubleCount || 7);
  const bag: [number | "double", number][] = [
    [10, 10],
    [20, 5],
    [30, 3],
    [50, 2],
    [100, 1],
    ["double", doubles],
  ];
  const total = bag.reduce((a, [, w]) => a + w, 0);

  const tiles: CrazyTile[] = Array.from({ length: CRAZY_TILES }, () => {
    let x = rng() * total;
    let pick: number | "double" = 10;
    for (const [v, w] of bag) {
      if (x < w) {
        pick = v;
        break;
      }
      x -= w;
    }
    return pick === "double"
      ? { text: "x2", tier: "double" as const }
      : { text: `${pick * boost}x`, tier: String(pick) as CrazyTile["tier"] };
  });

  for (let k = 0; plan && k < plan.segCount; k++) {
    ARROW_ORDER.forEach((c, i) => {
      const t = plan.texts[c][k];
      if (!t) return; // this arrow is not spinning in this round
      const slot = plan.idx[k + 1] + (i - 1) * ARROW_GAP; // red = left, green = centre, blue = right
      if (t.startsWith("DOUBLE")) {
        tiles[slot] = { text: "x2", tier: "double", arrow: c, seg: k };
      } else {
        const v = parseFloat(t);
        tiles[slot] = { text: t, tier: tierOfValue(Number.isFinite(v) ? v / Math.max(1, plan.factors[k]) : 10), arrow: c, seg: k };
      }
    });
  }
  return tiles;
}

const easeOutQuad = (t: number) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 2);

/** Splits the Crazy Time animation into one time slice per spin round. */
function crazyTimeline(segCount: number, totalMs: number) {
  const weights = Array.from({ length: segCount }, (_, k) => (k === 0 ? 1.4 : 1));
  const sum = weights.reduce((a, b) => a + b, 0);
  const durs = weights.map((w) => (totalMs * w) / sum);
  const starts: number[] = [];
  let t = 0;
  for (const d of durs) {
    starts.push(t);
    t += d;
  }
  return { starts, durs, total: totalMs };
}

type CrazyTimeline = ReturnType<typeof crazyTimeline>;

/** Strip position (as a tile index) `elapsed` ms after the Crazy Time spin starts. */
function crazyStripIndex(plan: CrazyPlan, elapsed: number, tl: CrazyTimeline): number {
  for (let k = 0; k < plan.segCount; k++) {
    const s = tl.starts[k];
    const spinLen = tl.durs[k] * CRAZY_SPIN_FRAC;
    if (elapsed >= s + spinLen) continue;
    if (elapsed <= s) return plan.idx[k];
    const ease = k === 0 ? easeOutSoft : easeOutQuad; // respins glide gently so you can follow them
    return plan.idx[k] + (plan.idx[k + 1] - plan.idx[k]) * ease((elapsed - s) / spinLen);
  }
  return plan.idx[plan.segCount];
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
    /* storage unavailable */
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
      <svg viewBox="0 0 32 32" className="wicon" aria-hidden="true">
        <path
          d="M3 9.5h20.5l3 3.2v4.3h-6.3l-1.7 7.6h-5.4l1.4-7.6H9.7L8 19.6 3 17.2z"
          fill="currentColor"
        />
      </svg>
    );
  }

  if (kind === "3x" || kind === "10x") {
    return (
      <svg viewBox="0 0 32 32" className="wicon" aria-hidden="true">
        <path d="M28 4 L17.8 19.8 L12.2 14.2 Z" fill="currentColor" />
        <path d="M10.5 12.5 L19.5 21.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
        <path d="M15 17 L6.5 25.5" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" fill="none" />
      </svg>
    );
  }

  if (kind === "bonus") {
    return (
      <svg viewBox="0 0 32 32" className="wicon" aria-hidden="true">
        <path
          d="M16 3l3.8 8.2 8.9 1-6.6 6 1.9 8.8L16 22.5 8 27l1.9-8.8-6.6-6 8.9-1z"
          fill="currentColor"
        />
      </svg>
    );
  }

  if (kind === "crazytime") {
    return (
      <svg viewBox="0 0 32 32" className="wicon" aria-hidden="true">
        <circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" strokeWidth="2.6" />
        <path d="M16 5v6M25.5 16h-6M16 27v-6M6.5 16h6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="16" cy="16" r="3.5" fill="currentColor" />
      </svg>
    );
  }

  return <img className="wicon wicon--img" src={img("heads.webp")} alt="" />;
}

function ArrowPointer({ color }: { color: CrazyArrowColor }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`wcrazy__arrow-svg wcrazy__arrow-svg--${color}`}
      aria-hidden="true"
    >
      <path d="M12 2L19 13h-4.5v9h-5v-9H5L12 2z" fill="currentColor" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path
        d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm7 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM9 13c-3 0-6 1.5-6 4v2h12v-2c0-2.5-3-4-6-4zm7 0c-.4 0-.8 0-1.2.1 1.4 1 2.2 2.3 2.2 3.9v2h4v-2c0-2.3-2.4-4-5-4z"
        fill="currentColor"
      />
    </svg>
  );
}

/* ---------- the strip ---------- */

type StripTile = WheelTarget | CrazyTile;

const Strip = memo(function Strip({
  tiles,
  tile,
  winIndex,
  trackRef,
  pick,
  done,
  startX,
}: {
  tiles: StripTile[];
  tile: number;
  winIndex: number | null;
  trackRef: Ref<HTMLDivElement>;
  pick: CrazyArrowColor | null;
  /** Crazy Time: how many spin rounds have landed */
  done: number;
  /** where the strip starts, so a new strip never flashes at x = 0 before the animation takes over */
  startX: number;
}) {
  return (
    <div className="wstrip__track" ref={trackRef} style={{ gap: GAP, transform: `translate3d(${startX}px,0,0)` }}>
      {tiles.map((t, i) => {
        if (typeof t !== "string") {
          const landed = t.arrow !== undefined && t.seg !== undefined && t.seg < done;
          return (
            <div
              key={i}
              className={`wtile wtile--cz-${t.tier} ${landed ? "is-landed" : ""} ${landed && pick === t.arrow ? "is-pick" : ""}`}
              style={{ width: tile, height: tile, ...(landed && t.arrow ? ({ "--ac": ARROW_HEX[t.arrow] } as CSSProperties) : null) }}
            >
              <span className="wtile__cz">{t.text}</span>
            </div>
          );
        }
        return (
          <div
            key={i}
            className={`wtile wtile--${t} ${winIndex === i ? "is-win" : winIndex !== null ? "is-dim" : ""}`}
            style={{ width: tile, height: tile }}
          >
            <Icon kind={t} />
            <span className="wtile__label">
              {t === "bonus" ? "BONUS" : t === "coinflip" ? "FLIP" : t === "crazytime" ? "CRAZY" : LABEL[t]}
            </span>
          </div>
        );
      })}
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
  onChooseArrow,
  onRoundEnd,
  onRefresh,
  onRepeat,
}: Props) {
  const coin = useCoin();

  const [amount, setAmount] = useState("");
  const [clock, setClock] = useState(Date.now());
  const [width, setWidth] = useState(720);
  const [chosenArrow, setChosenArrow] = useState<CrazyArrowColor>("green");
  const [arrowLocked, setArrowLocked] = useState(false);
  /** where the Crazy Time arrows are: -1 = not started, 2k = spin k running, 2k+1 = spin k landed */
  const [crazyStage, setCrazyStage] = useState(-1);

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
  const crazyStartRef = useRef<{ id: number; at: number } | null>(null);

  const tile = width < 560 ? 72 : 80;
  const step = tile + GAP;

  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 200);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth || 720);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!state) return;
    if (state.my_arrow === "red" || state.my_arrow === "green" || state.my_arrow === "blue") {
      setChosenArrow(state.my_arrow);
      setArrowLocked(true);
    } else {
      setChosenArrow("green");
      setArrowLocked(false);
    }
  }, [state?.id, state?.my_arrow]);

  const now = clock + offset;
  const roundId = state?.id ?? 0;

  const { tiles, jitter } = useMemo(() => {
    const rng = mulberry32(roundId * 2654435761 + 12345);
    const list: WheelTarget[] = Array.from({ length: COUNT }, () => pickWeighted(rng()));
    const j = (rng() - 0.5) * 0.6;
    return { tiles: list, jitter: j };
  }, [roundId]);

  const bettingEnds = state?.betting_ends_at ?? 0;
  const spinStarts = bettingEnds + SPIN_DELAY;
  const spinEnds = state?.spin_ends_at ?? 0;
  const roundEnds = state?.ends_at ?? 0;

  const phase:
    | "loading"
    | "betting"
    | "locked"
    | "spinning"
    | "reveal"
    | "ended" = !state
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

  const spun = phase === "reveal" || phase === "ended";
  const betsClosed = state != null && now >= bettingEnds;

  const result = state?.result ?? null;
  const boostTarget = betsClosed ? (state?.boost_target ?? null) : null;
  const boostMult = betsClosed && state?.boost_mult && state.boost_mult > 1 ? state.boost_mult : 1;

  const shownTiles = useMemo(() => {
    if (!result) return tiles;
    const copy = tiles.slice();
    copy[RES] = result;
    return copy;
  }, [tiles, result]);

  const hasBonus = result === "bonus" || result === "coinflip" || result === "crazytime";
  const resultBoost = result && boostTarget === result ? boostMult : 1;

  // the wheel is polled every 1.5s and gives a fresh object each time: compare by content
  const crazyKey = JSON.stringify(state?.crazy_bonus ?? null);

  const crazyBonus: CrazyBonusData | null = useMemo(() => {
    if (result !== "crazytime") return null;
    if (state?.crazy_bonus) return state.crazy_bonus;
    return buildCrazySimulation(roundId, resultBoost);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, crazyKey, roundId, resultBoost]);

  // The server only reveals the arrow results after the pick window closes. Until then the strip shows
  // a preview board; the spin plan is built from the real result only, so nothing ever jumps.
  const realBonus: CrazyBonusData | null = useMemo(
    () => (result === "crazytime" ? (state?.crazy_bonus ?? null) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result, crazyKey]
  );
  const crazyPlan: CrazyPlan | null = useMemo(() => (realBonus ? buildCrazyPlan(realBonus) : null), [realBonus]);

  /** Crazy Time: once the strip has landed on CRAZY, the same strip turns into the Crazy Time multipliers. */
  const crazyMode = spun && result === "crazytime";
  const crazyTiles = useMemo<StripTile[]>(
    () => (crazyMode ? buildCrazyTiles(roundId, realBonus?.doubleCount ?? 7, crazyPlan, resultBoost) : []),
    [crazyMode, realBonus, crazyPlan, roundId, resultBoost]
  );

  const chosenCrazyMult =
    result === "crazytime" && crazyBonus
      ? crazyBonus.arrows[chosenArrow]?.finalMult ?? (state?.mult ?? 10) * resultBoost
      : null;

  const highestCrazyMult =
    result === "crazytime" && crazyBonus
      ? crazyBonus.highestMult
      : null;

  const effectiveMult =
    result === "crazytime"
      ? chosenCrazyMult
      : state?.mult != null
        ? state.mult * resultBoost
        : null;

  useLayoutEffect(() => {
    if (!state || crazyMode) return;
    const track = trackRef.current;
    if (!track) return;

    const center = (i: number) => i * step + tile / 2;
    const startX = width / 2 - center(START);
    const endX = width / 2 - (center(RES) + jitter * tile);

    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const frame = () => {
      const n = Date.now() + offsetRef.current;
      let x = startX;

      if (n >= spinStarts) {
        const t = (n - spinStarts) / Math.max(1, spinEnds - spinStarts);
        x = startX + (endX - startX) * easeOut(t);
      }

      track.style.transform = `translate3d(${x}px,0,0)`;

      if (n < spinStarts) {
        timer = setTimeout(frame, Math.min(500, Math.max(30, spinStarts - n)));
      } else if (n < spinEnds) {
        raf = requestAnimationFrame(frame);
      }
    };

    frame();

    return () => {
      cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
    };
  }, [state, step, tile, width, jitter, spinStarts, spinEnds, crazyMode]);

  useEffect(() => {
    if (!spun || result !== "coinflip") return;
    const el = coinRef.current;
    if (!el) return;

    const targetOffset = state?.mult === 25 ? 180 : 0;
    const coinDur = bonusAnimMs("coinflip", roundEnds - spinEnds);
    let raf = 0;

    const tickCoin = () => {
      const n = Date.now() + offsetRef.current;
      const elapsed = Math.max(0, n - spinEnds);
      const p = Math.min(1, elapsed / coinDur);
      const eased = easeInOutCubic(p);
      const angle = 360 * 6 * eased + targetOffset * eased;
      const lift = Math.sin(p * Math.PI) * 14;
      const scale = 1 + Math.sin(p * Math.PI) * 0.14;

      el.style.transform = `translate3d(0, ${-lift}px, 0) scale(${scale}) rotateY(${angle}deg)`;

      if (p < 1) {
        raf = requestAnimationFrame(tickCoin);
      } else {
        el.style.transform = `translate3d(0, 0, 0) scale(1) rotateY(${360 * 6 + targetOffset}deg)`;
      }
    };

    raf = requestAnimationFrame(tickCoin);
    return () => cancelAnimationFrame(raf);
  }, [spun, result, state?.mult, spinEnds, roundEnds]);

  useEffect(() => {
    if (!state) return;

    const t1 = setTimeout(
      onRefresh,
      Math.max(0, state.betting_ends_at - (Date.now() + offsetRef.current)) + 120
    );
    const t2 = setTimeout(
      () => onRefresh(),
      Math.max(0, state.betting_ends_at - (Date.now() + offsetRef.current)) + 700
    );
    const t3 = setTimeout(
      onRoundEnd,
      Math.max(0, state.ends_at - (Date.now() + offsetRef.current)) + 400
    );

    const reveal = Math.max(0, state.spin_ends_at + CRAZY_PICK_WINDOW - (Date.now() + offsetRef.current));
    const t4 = setTimeout(onRefresh, reveal + 120);
    const t5 = setTimeout(onRefresh, reveal + 600);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.id, state?.betting_ends_at, state?.ends_at]);

  const bonusElapsed = Math.max(0, now - spinEnds);
  const animDuration = bonusAnimMs(result, roundEnds - spinEnds);
  const pickWindow = Math.min(CRAZY_PICK_WINDOW, Math.floor(animDuration * 0.4));
  const bonusDone = bonusElapsed >= animDuration || phase === "ended";

  /* Crazy Time: the strip spins under the 3 arrows; DOUBLE hits respin it */
  useLayoutEffect(() => {
    if (!crazyMode || !crazyPlan) {
      setCrazyStage(-1);
      return;
    }
    const track = trackRef.current;
    if (!track) return;

    // The spin starts when the pick window closes, or when the result arrives if that is a bit later.
    // Remembered per round so a resize or re-render never restarts it.
    if (!crazyStartRef.current || crazyStartRef.current.id !== roundId) {
      const earliest = spinEnds + pickWindow;
      crazyStartRef.current = { id: roundId, at: Math.max(earliest, Math.min(Date.now() + offsetRef.current, earliest + 2500)) };
    }
    const startAt = crazyStartRef.current.at;

    const tl = crazyTimeline(crazyPlan.segCount, Math.max(1, animDuration - pickWindow));
    let raf = 0;
    let last = -2;

    const frame = () => {
      const n = Date.now() + offsetRef.current;
      const elapsed = n - startAt;

      const x = width / 2 - (crazyStripIndex(crazyPlan, elapsed, tl) * step + tile / 2);
      track.style.transform = `translate3d(${x}px,0,0)`;

      let stage = -1;
      if (elapsed >= 0) {
        let seg = 0;
        for (let k = 0; k < crazyPlan.segCount; k++) if (elapsed >= tl.starts[k]) seg = k;
        const spinning = elapsed - tl.starts[seg] < tl.durs[seg] * CRAZY_SPIN_FRAC;
        stage = seg * 2 + (spinning ? 0 : 1);
      }
      if (stage !== last) {
        last = stage;
        setCrazyStage(stage);
      }

      if (elapsed < tl.total) raf = requestAnimationFrame(frame);
    };

    frame();
    return () => cancelAnimationFrame(raf);
  }, [crazyMode, crazyPlan, roundId, spinEnds, pickWindow, animDuration, step, tile, width]);

  useEffect(() => {
    if (!state || !result || effectiveMult == null) return;
    if (phase !== "reveal" || reported.current === state.id) return;
    if (result === "crazytime" && !bonusDone) return;

    reported.current = state.id;

    const bet = Object.values(state.mine).reduce((a, b) => a + (b ?? 0), 0);
    const won = (state.mine[result] ?? 0) * effectiveMult;

    setLastOutcome({
      id: state.id,
      result,
      mult: effectiveMult,
      bet,
      won,
    });
  }, [state, phase, result, effectiveMult, bonusDone]);

  const amountNum = Math.floor(Number(amount.replace(/[^0-9]/g, "")) || 0);
  const canBet = phase === "betting";

  /* ---------- Repeat last bet / Auto bet ---------- */

  const [lastBets, setLastBets] = useState<Bets>(() => readJson<Bets>(LAST_KEY) ?? {});
  const [auto, setAuto] = useState(false);
  const [autoMsg, setAutoMsg] = useState("");
  const autoRound = useRef(0);
  const placing = useRef(false);
  const mineKey = JSON.stringify(state?.mine ?? {});

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

  useEffect(() => {
    if (!auto) return;
    if (!loggedIn) {
      setAuto(false);
      return;
    }
    if (!state || phase !== "betting" || busy || placing.current) return;
    if (autoRound.current === state.id) return;

    if (betThisRound) {
      autoRound.current = state.id;
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
    setAmount(n > 0 ? String(Math.floor(n)) : "");
  }

  function place(target: WheelTarget) {
    if (!loggedIn) return onLogin();
    if (!canBet || busy || amountNum < 1) return;
    onBet(target, amountNum);
  }

  function selectArrowWhenHit(color: CrazyArrowColor) {
    if (!spun || result !== "crazytime") return;
    if (arrowLocked) return;
    setChosenArrow(color);
    setArrowLocked(true);
    if (loggedIn && onChooseArrow && state) {
      onChooseArrow(state.id, color).catch(() => {});
    }
  }

  function multLabel(target: WheelTarget) {
    const m = boostTarget === target ? boostMult : 1;

    if (target === "2x") return `${2 * m}x`;
    if (target === "3x") return `${3 * m}x`;
    if (target === "5x") return `${5 * m}x`;
    if (target === "10x") return `${10 * m}x`;
    if (target === "coinflip") return `${7 * m}x / ${25 * m}x`;
    if (target === "crazytime") {
      return m > 1
        ? `3 Arrows · Board ${m}x`
        : "3 Arrows · 10x–100x + 2x";
    }
    return `${BONUS_MIN * m}x – ${BONUS_MAX * m}x`;
  }

  const secondsLeft = Math.max(0, Math.ceil((bettingEnds - now) / 1000));
  const progress = state ? Math.min(1, Math.max(0, (bettingEnds - now) / 11000)) : 0;
  const winIndex = spun && result && !crazyMode ? RES : null;

  const inCrazyPickPhase = spun && result === "crazytime" && bonusElapsed < pickWindow && !arrowLocked;
  const crazyPickSecondsLeft = Math.max(0, Math.ceil((pickWindow - bonusElapsed) / 1000));

  const crazySegs = crazyPlan?.segCount ?? 1;
  const crazyStageNow = bonusDone ? crazySegs * 2 - 1 : crazyStage;
  /** how many spin rounds have finished (0 = none yet) */
  const crazyDone = crazyStageNow < 0 ? 0 : Math.ceil(crazyStageNow / 2);
  /** which spin round is moving right now (-1 = none) */
  const crazySpinSeg = crazyStageNow >= 0 && crazyStageNow % 2 === 0 ? crazyStageNow / 2 : -1;
  const crazyFactor =
    crazyPlan && crazyBonus
      ? bonusDone
        ? crazyBonus.boardDoubleFactor || crazyPlan.factors[crazySegs]
        : crazyPlan.factors[crazyDone]
      : 1;

  let crazyCaption = "";
  let crazyCaptionDouble = false;
  if (crazyPlan) {
    if (inCrazyPickPhase) {
      crazyCaption = "Pick your arrow before the spin starts!";
    } else if (crazyStageNow < 0) {
      crazyCaption = "Arrows ready…";
    } else if (crazySpinSeg === 0) {
      crazyCaption = "All 3 arrows are spinning…";
    } else if (crazySpinSeg > 0) {
      const who = ARROW_ORDER.filter((c) => crazyPlan.paths[c].length > crazySpinSeg)
        .map((c) => c.toUpperCase())
        .join(" & ");
      crazyCaption = `RESPIN · ${who} · Board x${crazyPlan.factors[crazySpinSeg]}`;
      crazyCaptionDouble = true;
    } else {
      const seg = (crazyStageNow - 1) / 2;
      const hits = crazyPlan.doubleHits[seg] ?? [];
      if (hits.length) {
        crazyCaption = `DOUBLE! ${hits.map((c) => c.toUpperCase()).join(" & ")} · Board x${crazyPlan.factors[seg + 1]}`;
        crazyCaptionDouble = true;
      } else {
        crazyCaption = "All arrows landed!";
      }
    }
  }

  let rolling: number | null = null;

  if (result === "bonus" && effectiveMult != null) {
    if (bonusDone) {
      rolling = effectiveMult;
    } else {
      const k = Math.floor(Math.sqrt(bonusElapsed / animDuration) * 36);
      const span = BONUS_MAX - BONUS_MIN + 1;
      rolling = (BONUS_MIN + Math.floor(mulberry32(roundId * 977 + k)() * span)) * resultBoost;
    }
  }

  const totals = state?.totals ?? {};
  const mine = state?.mine ?? {};
  const hasCrazyBet = (mine.crazytime ?? 0) > 0;

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
              ? hasBonus && !bonusDone
                ? result === "bonus"
                  ? "Bonus round!"
                  : result === "crazytime"
                    ? inCrazyPickPhase
                      ? `Crazy Time! Pick Arrow · ${crazyPickSecondsLeft}s`
                      : "Crazy Time 3-Arrow Spin!"
                    : "Coinflip bonus!"
                : result === "crazytime"
                  ? `Top: ${highestCrazyMult}x`
                  : `${effectiveMult}x`
              : "Next round starting…";

  return (
    <>
      <div className="wheel-top">
        <div className="wheel-history" aria-label="Previous results">
          {(state?.history ?? []).slice(0, 12).map((h) => (
            <span
              key={h.id}
              className={`whist whist--${h.result}`}
              title={`${LABEL[h.result]} (${h.mult}x)`}
            >
              {`${h.mult}x`}
            </span>
          ))}
        </div>

        <span className="wheel-50x">{bestText(state?.best_mult ?? null)}</span>

        <span className={`wheel__phase wheel__phase--${phase}`}>{statusText}</span>
      </div>

      <section className={`panel wheel ${boostMult === 50 ? "is-mega" : ""}`}>
        <div className={`wstrip ${boostMult === 50 ? "is-mega" : ""}`} ref={viewportRef}>
          <div className="wstrip__bar">
            <div className="wstrip__bar-fill" style={{ width: `${progress * 100}%` }} />
          </div>

          {crazyMode ? (
            ARROW_ORDER.map((c, i) => {
              // spin round that was last started / landed: after the first one, only arrows that hit DOUBLE stay
              const lastSeg = crazySpinSeg >= 0 ? crazySpinSeg : crazyStageNow >= 0 ? (crazyStageNow - 1) / 2 : -1;
              const active = lastSeg <= 0 || (crazyPlan?.paths[c].length ?? 0) > lastSeg;
              const cls = !active ? "is-gone" : crazySpinSeg > 0 ? "is-respin" : "";
              const style = { left: `calc(50% + ${(i - 1) * ARROW_GAP * step}px)`, "--mc": ARROW_HEX[c] } as CSSProperties;
              return (
                <div key={c} aria-hidden="true">
                  <div className={`wstrip__marker wstrip__marker--crazy ${cls}`} style={style} />
                  <div className={`wstrip__line wstrip__line--crazy ${cls}`} style={style} />
                </div>
              );
            })
          ) : (
            <>
              <div className="wstrip__marker" aria-hidden="true" />
              <div className="wstrip__line" aria-hidden="true" />
            </>
          )}
          <div className="wstrip__fade wstrip__fade--l" aria-hidden="true" />
          <div className="wstrip__fade wstrip__fade--r" aria-hidden="true" />

          <Strip
            key={roundId}
            tiles={crazyMode ? crazyTiles : shownTiles}
            tile={tile}
            winIndex={winIndex}
            trackRef={trackRef}
            pick={crazyMode ? chosenArrow : null}
            done={crazyMode ? crazyDone : 0}
            startX={width / 2 - ((crazyMode ? CRAZY_START : START) * step + tile / 2)}
          />
        </div>

        {spun && hasBonus && (
          <div className={`wbonus wbonus--${result} ${bonusDone ? "is-done" : ""}`}>
            {result === "bonus" ? (
              <>
                <div className="wbonus__title">BONUS ROUND</div>
                <div className="wbonus__mult">{rolling}x</div>
              </>
            ) : result === "crazytime" && crazyBonus ? (
              <div className="wcrazy">
                <div className="wbonus__title">
                  CRAZY TIME · 3 ARROWS · {crazyBonus.doubleCount} DOUBLES ON BOARD
                  {resultBoost > 1 ? ` · PRE-SPIN BOOST ${resultBoost}x APPLIED` : ""}
                  {crazyFactor > 1 ? ` · BOARD x${crazyFactor}` : ""}
                </div>

                {crazyPlan && (
                  <div className={`wcrazy__caption ${crazyCaptionDouble ? "is-double" : ""}`}>{crazyCaption}</div>
                )}

                <div className="wcrazy-pick">
                  <span className="wcrazy-pick__label">
                    {inCrazyPickPhase
                      ? `Choose Your Arrow Color (${crazyPickSecondsLeft}s):`
                      : `Selected Arrow: ${chosenArrow.toUpperCase()}`}
                  </span>
                  <div className="wcrazy-pick__btns" role="group" aria-label="Choose Crazy Time arrow color">
                    {ARROWS.map((a) => (
                      <button
                        key={a.color}
                        type="button"
                        disabled={!inCrazyPickPhase}
                        onClick={() => selectArrowWhenHit(a.color)}
                        className={`wcrazy-pick__btn wcrazy-pick__btn--${a.color} ${
                          chosenArrow === a.color ? "is-selected" : ""
                        }`}
                      >
                        <ArrowPointer color={a.color} />
                        <span>{a.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="wcrazy__arrows">
                  {ARROWS.map((a) => {
                    const info = crazyBonus.arrows[a.color];
                    const landed = crazyPlan ? crazyPlan.paths[a.color].slice(0, crazyDone) : [];
                    const lastText = info.steps[landed.length - 1];
                    const isPicked = chosenArrow === a.color;
                    const isTop = bonusDone && info.finalMult === highestCrazyMult;

                    // real values from the result, no fake counting
                    const displayMult = bonusDone
                      ? `${info.finalMult}x`
                      : inCrazyPickPhase || crazyStageNow < 0
                        ? "READY"
                        : !lastText
                          ? "…"
                          : lastText.startsWith("DOUBLE")
                            ? "RESPIN"
                            : lastText;

                    return (
                      <div
                        key={a.color}
                        onClick={() => selectArrowWhenHit(a.color)}
                        style={{ cursor: inCrazyPickPhase ? "pointer" : "default" }}
                        className={`wcrazy__card wcrazy__card--${a.color} ${isPicked ? "is-chosen" : ""} ${
                          isTop ? "is-top" : ""
                        }`}
                      >
                        <div className="wcrazy__card-head">
                          <ArrowPointer color={a.color} />
                          <span>{a.label}</span>
                          {isPicked && <span className="wcrazy__picked-tag">YOUR PICK</span>}
                          {isTop && <span className="wcrazy__top-tag">HISTORY TOP</span>}
                        </div>

                        <div className="wcrazy__card-mult">{displayMult}</div>

                        <div className="wcrazy__card-steps">
                          {bonusDone
                            ? info.steps.join(" → ")
                            : inCrazyPickPhase
                              ? "Click to pick this arrow before spin!"
                              : landed.length
                                ? info.steps.slice(0, landed.length).join(" → ")
                                : "Spinning…"}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="wcrazy__summary">
                  {hasCrazyBet ? (
                    <>
                      Your <b>{chosenArrow.toUpperCase()}</b> arrow:{" "}
                      <b>{bonusDone ? `${chosenCrazyMult}x` : "…"}</b> · History records highest:{" "}
                      <b>{bonusDone ? `${highestCrazyMult}x` : "…"}</b>
                    </>
                  ) : (
                    <>
                      Highest arrow (recorded in history):{" "}
                      <b>{bonusDone ? `${highestCrazyMult}x` : "…"}</b>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="wbonus__title">
                  COINFLIP BONUS · Heads {7 * resultBoost}x · Tails {25 * resultBoost}x
                </div>

                <div
                  ref={coinRef}
                  className="wbonus__coin"
                  style={{
                    transform: `rotateY(${state?.mult === 25 ? 180 : 0}deg)`,
                  }}
                >
                  <img src={img("heads.webp")} alt="Heads" className="wbonus__face" />
                  <img
                    src={img("tails.webp")}
                    alt="Tails"
                    className="wbonus__face wbonus__face--back"
                  />
                </div>

                <div className="wbonus__mult">{bonusDone ? `${effectiveMult}x` : "…"}</div>
              </>
            )}
          </div>
        )}

        {lastOutcome &&
          (phase === "reveal" || phase === "ended") &&
          lastOutcome.id === roundId &&
          lastOutcome.bet > 0 &&
          (!hasBonus || bonusDone) && (
            <div className={`wheel__outcome ${lastOutcome.won > 0 ? "is-win" : "is-lose"}`}>
              {lastOutcome.won > 0 ? (
                <>
                  You won <b>{coin} {fmt(lastOutcome.won)}</b>
                </>
              ) : (
                <>
                  No win this round · you bet <b>{coin} {fmt(lastOutcome.bet)}</b>
                </>
              )}
            </div>
          )}
      </section>

      <section className={`panel wheel-bet ${boostMult === 50 ? "is-mega" : ""}`}>
        <div className="wheel-bet__amount">
          <div className="wheel-bet__input">
            <span className="wheel-bet__coin">{coin}</span>
            <input
              className="input"
              inputMode="numeric"
              placeholder="Bet amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
            />
          </div>

          <div className="wheel-bet__chips">
            <button className="chip-btn" onClick={() => setAmt(amountNum + 10)}>+10</button>
            <button className="chip-btn" onClick={() => setAmt(amountNum + 100)}>+100</button>
            <button className="chip-btn" onClick={() => setAmt(amountNum + 1000)}>+1K</button>
            <button className="chip-btn" onClick={() => setAmt(amountNum / 2)}>½</button>
            <button className="chip-btn" onClick={() => setAmt(amountNum * 2)}>2×</button>
            <button className="chip-btn" onClick={() => setAmt(coins)}>Max</button>
            <button className="chip-btn chip-btn--clear" onClick={() => setAmt(0)}>Clear</button>

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
            const tot = totals[t];
            const my = mine[t] ?? 0;
            const win = spun && result === t;
            const isBoosted = boostTarget === t && boostMult > 1;

            return (
              <div
                key={t}
                className={`wbet wbet--${t} ${isBoosted ? `wbet--boost-${boostMult}` : ""} ${
                  win ? "is-win" : ""
                } ${spun && !win ? "is-dim" : ""}`}
              >
                <div className="wbet__head">
                  <div className={`wbet__icon wtile--${t}`}>
                    <Icon kind={t} />
                  </div>

                  <div className="wbet__name">
                    <span className="wbet__title-row">
                      {LABEL[t]}
                      {isBoosted && (
                        <span className={`wbet__boost-pill wbet__boost-pill--${boostMult}`}>
                          {`x${boostMult}`}
                        </span>
                      )}
                    </span>

                    <small className={isBoosted ? "is-boosted-mult" : ""}>{multLabel(t)}</small>
                  </div>

                  <div className="wbet__stats">
                    <span title="Coins bet by everyone">
                      <i className="wbet__coin">{coin}</i> {fmt(tot?.coins ?? 0)}
                    </span>
                    <span title="Players">
                      <PeopleIcon /> {tot?.players ?? 0}
                    </span>
                  </div>
                </div>

                <button
                  className={`wbet__bar ${canBet ? "is-open" : ""}`}
                  disabled={!!loggedIn && (!canBet || busy)}
                  onClick={() => place(t)}
                >
                  <span className="wbet__txt">
                    {!loggedIn ? "LOG IN TO BET" : canBet ? "PLACE A BET" : "BETS CLOSED"}
                  </span>
                  <span className="wbet__mine">
                    <i className="wbet__coin">{coin}</i> {fmt(my)}
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