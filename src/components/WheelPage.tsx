import { memo, useEffect, useMemo, useRef, useState, type Ref } from "react";
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
const BONUS_ANIM = 5500;
const CRAZY_PICK_WINDOW = 3500;
const CRAZY_ANIM = 13000;

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


/* ---------- Crazy Time roulette board ---------- */

const ARROW_ORDER: CrazyArrowColor[] = ["red", "green", "blue"];
const ARROW_HEX: Record<CrazyArrowColor, string> = {
  red: "#ff5c6c",
  green: "#2ee27d",
  blue: "#38bdf8",
};

const WHEEL_C = 150;
const WHEEL_R = 120;
const WHEEL_HUB = 30;
const WHEEL_LABEL_R = 92;
/** Share of each spin segment the arrows are moving; the rest is a pause to show where they landed. */
const CRAZY_SPIN_FRAC = 0.75;

interface CrazyStep {
  slot: number;
  double: boolean;
}

interface CrazyPlan {
  slots: BoardSlot[];
  /** every landing of each arrow, in order (a DOUBLE is followed by a respin) */
  paths: Record<CrazyArrowColor, CrazyStep[]>;
  /** absolute rotation (deg, clockwise from the top): [start, end of step 0, end of step 1, ...] */
  angles: Record<CrazyArrowColor, number[]>;
  /** number of spin rounds on the wheel: 1 = first spin, each extra one is a respin */
  segCount: number;
  /** board double factor before segment j (index segCount = final) */
  factors: number[];
  /** arrows that hit DOUBLE in each segment */
  doubleHits: CrazyArrowColor[][];
}

function buildCrazyBoard(roundId: number, doubleCount: number): BoardSlot[] {
  const rng = mulberry32(roundId * 7919 + 31337);
  const slots: BoardSlot[] = [
    ...Array.from({ length: 10 }, () => ({ kind: "mult" as const, baseValue: 10 })),
    ...Array.from({ length: 5 }, () => ({ kind: "mult" as const, baseValue: 20 })),
    ...Array.from({ length: 3 }, () => ({ kind: "mult" as const, baseValue: 30 })),
    ...Array.from({ length: 2 }, () => ({ kind: "mult" as const, baseValue: 50 })),
    { kind: "mult" as const, baseValue: 100 },
    ...Array.from({ length: Math.max(1, doubleCount || 5) }, () => ({ kind: "double" as const })),
  ];
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  return slots;
}

/**
 * Turns the round's result (each arrow's list of steps, e.g. ["DOUBLE (x2)", "40x"]) into a
 * visual plan: which board slot each arrow lands on, and how far it has to rotate to get there.
 * It is deterministic (seeded by the round id) so every player sees the same wheel.
 */
function buildCrazyPlan(roundId: number, bonus: CrazyBonusData, boost: number): CrazyPlan {
  const slots = buildCrazyBoard(roundId, bonus.doubleCount);
  const rng = mulberry32(roundId * 1103515245 + 777);
  const used = new Set<number>();

  const take = (want: (s: BoardSlot) => boolean): number => {
    const all = slots.map((_, i) => i).filter((i) => want(slots[i]));
    const free = all.filter((i) => !used.has(i));
    const pool = free.length ? free : all;
    const idx = pool.length ? pool[Math.floor(rng() * pool.length)] : Math.floor(rng() * slots.length);
    used.add(idx);
    return idx;
  };

  const BASES = [10, 20, 30, 50, 100];
  const paths: Record<CrazyArrowColor, CrazyStep[]> = { red: [], green: [], blue: [] };
  let factor = 1;

  for (const color of ARROW_ORDER) {
    const info = bonus.arrows[color];
    const hasSteps = !!info?.steps?.length;
    const steps = hasSteps ? info.steps : [`${info?.finalMult ?? 10}x`];

    for (const stepText of steps) {
      if (stepText.startsWith("DOUBLE")) {
        const m = /x(\d+)/.exec(stepText);
        factor = m ? Number(m[1]) : factor * 2;
        paths[color].push({ slot: take((x) => x.kind === "double"), double: true });
      } else {
        const shown = parseFloat(stepText);
        const f = hasSteps ? factor : bonus.boardDoubleFactor || 1;
        const base = Number.isFinite(shown) ? shown / (boost * f) : 10;
        const closest = BASES.reduce((a, b) => (Math.abs(b - base) < Math.abs(a - base) ? b : a), 10);
        paths[color].push({
          slot: take((x) => x.kind === "mult" && x.baseValue === closest),
          double: false,
        });
      }
    }
  }

  const sweep = 360 / slots.length;
  const starts: Record<CrazyArrowColor, number> = { red: 0, green: 120, blue: 240 };
  const angles: Record<CrazyArrowColor, number[]> = { red: [], green: [], blue: [] };

  for (const color of ARROW_ORDER) {
    let cur = starts[color];
    angles[color].push(cur);
    paths[color].forEach((step, k) => {
      const target = (step.slot + 0.5) * sweep;
      const delta = (((target - cur) % 360) + 360) % 360 + 360 * (k === 0 ? 3 : 2);
      cur += delta;
      angles[color].push(cur);
    });
  }

  const segCount = Math.max(1, ...ARROW_ORDER.map((c) => paths[c].length));
  const doubleHits: CrazyArrowColor[][] = [];
  const factors = [1];
  for (let k = 0; k < segCount; k++) {
    const hits = ARROW_ORDER.filter((c) => paths[c][k]?.double);
    doubleHits.push(hits);
    factors.push(factors[k] * Math.pow(2, hits.length));
  }

  return { slots, paths, angles, segCount, factors, doubleHits };
}

/** Rotation of one arrow `elapsed` ms after the arrows start spinning. */
function crazyArrowAngle(plan: CrazyPlan, color: CrazyArrowColor, elapsed: number, segDur: number): number {
  const a = plan.angles[color];
  const n = plan.paths[color].length;
  const spinLen = segDur * CRAZY_SPIN_FRAC;
  for (let k = 0; k < n; k++) {
    const s = k * segDur;
    if (elapsed >= s + spinLen) continue;
    if (elapsed <= s) return a[k];
    return a[k] + (a[k + 1] - a[k]) * easeOut((elapsed - s) / spinLen);
  }
  return a[n];
}

function wheelPoint(r: number, deg: number): [number, number] {
  const t = (deg * Math.PI) / 180;
  return [WHEEL_C + r * Math.sin(t), WHEEL_C - r * Math.cos(t)];
}

function wedgePath(i: number, n: number): string {
  const a0 = (i * 360) / n;
  const a1 = ((i + 1) * 360) / n;
  const [x0, y0] = wheelPoint(WHEEL_R, a0);
  const [x1, y1] = wheelPoint(WHEEL_R, a1);
  const [x2, y2] = wheelPoint(WHEEL_HUB, a1);
  const [x3, y3] = wheelPoint(WHEEL_HUB, a0);
  const f = (v: number) => v.toFixed(2);
  return `M${f(x0)} ${f(y0)} A${WHEEL_R} ${WHEEL_R} 0 0 1 ${f(x1)} ${f(y1)} L${f(x2)} ${f(y2)} A${WHEEL_HUB} ${WHEEL_HUB} 0 0 0 ${f(x3)} ${f(y3)} Z`;
}

function compact(n: number): string {
  if (n >= 10000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + "k";
  return String(n);
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

const Strip = memo(function Strip({
  tiles,
  tile,
  winIndex,
  trackRef,
}: {
  tiles: WheelTarget[];
  tile: number;
  winIndex: number | null;
  trackRef: Ref<HTMLDivElement>;
}) {
  return (
    <div className="wstrip__track" ref={trackRef} style={{ gap: GAP }}>
      {tiles.map((t, i) => (
        <div
          key={i}
          className={`wtile wtile--${t} ${
            winIndex === i ? "is-win" : winIndex !== null ? "is-dim" : ""
          }`}
          style={{ width: tile, height: tile }}
        >
          <Icon kind={t} />
          <span className="wtile__label">
            {t === "bonus"
              ? "BONUS"
              : t === "coinflip"
                ? "FLIP"
                : t === "crazytime"
                  ? "CRAZY"
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
  const arrowRefs = useRef<Record<CrazyArrowColor, SVGGElement | null>>({ red: null, green: null, blue: null });

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

  const crazyPlan: CrazyPlan | null = useMemo(
    () => (crazyBonus ? buildCrazyPlan(roundId, crazyBonus, resultBoost) : null),
    [crazyBonus, roundId, resultBoost]
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

  useEffect(() => {
    if (!state) return;
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
  }, [state, step, tile, width, jitter, spinStarts, spinEnds]);

  useEffect(() => {
    if (!spun || result !== "coinflip") return;
    const el = coinRef.current;
    if (!el) return;

    const targetOffset = state?.mult === 25 ? 180 : 0;
    let raf = 0;

    const tickCoin = () => {
      const n = Date.now() + offsetRef.current;
      const elapsed = Math.max(0, n - spinEnds);
      const p = Math.min(1, elapsed / BONUS_ANIM);
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
  }, [spun, result, state?.mult, spinEnds]);

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

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.id, state?.betting_ends_at, state?.ends_at]);

  const bonusElapsed = Math.max(0, now - spinEnds);
  const availableRevealWindow = Math.max(1000, roundEnds - spinEnds);
  const animDuration =
    result === "crazytime"
      ? Math.min(CRAZY_ANIM, availableRevealWindow)
      : Math.min(BONUS_ANIM, availableRevealWindow);
  const pickWindow = Math.min(CRAZY_PICK_WINDOW, Math.floor(animDuration * 0.4));
  const bonusDone = bonusElapsed >= animDuration || phase === "ended";

  /* Crazy Time: spin the 3 arrows around the roulette; DOUBLE hits respin on the same wheel */
  useEffect(() => {
    if (!spun || result !== "crazytime" || !crazyPlan) {
      setCrazyStage(-1);
      return;
    }

    const segDur = Math.max(1, (animDuration - pickWindow) / crazyPlan.segCount);
    let raf = 0;
    let last = -2;

    const frame = () => {
      const n = Date.now() + offsetRef.current;
      const elapsed = n - spinEnds - pickWindow;

      for (const c of ARROW_ORDER) {
        const g = arrowRefs.current[c];
        if (g) {
          g.setAttribute(
            "transform",
            `rotate(${crazyArrowAngle(crazyPlan, c, elapsed, segDur).toFixed(2)} ${WHEEL_C} ${WHEEL_C})`
          );
        }
      }

      let stage = -1;
      if (elapsed >= 0) {
        const seg = Math.min(crazyPlan.segCount - 1, Math.floor(elapsed / segDur));
        const spinning = elapsed - seg * segDur < segDur * CRAZY_SPIN_FRAC;
        stage = seg * 2 + (spinning ? 0 : 1);
      }
      if (stage !== last) {
        last = stage;
        setCrazyStage(stage);
      }

      if (elapsed < segDur * crazyPlan.segCount) raf = requestAnimationFrame(frame);
    };

    frame();
    return () => cancelAnimationFrame(raf);
  }, [spun, result, crazyPlan, spinEnds, pickWindow, animDuration]);

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
  const winIndex = spun && result ? RES : null;

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

  const crazyHits = new Map<number, CrazyArrowColor>();
  if (crazyPlan) {
    for (const c of ARROW_ORDER) {
      crazyPlan.paths[c].slice(0, crazyDone).forEach((s) => crazyHits.set(s.slot, c));
    }
  }

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

          <div className="wstrip__marker" aria-hidden="true" />
          <div className="wstrip__line" aria-hidden="true" />
          <div className="wstrip__fade wstrip__fade--l" aria-hidden="true" />
          <div className="wstrip__fade wstrip__fade--r" aria-hidden="true" />

          <Strip
            key={roundId}
            tiles={shownTiles}
            tile={tile}
            winIndex={winIndex}
            trackRef={trackRef}
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
                  <>
                    <div className={`wcrazy__caption ${crazyCaptionDouble ? "is-double" : ""}`}>{crazyCaption}</div>

                    <div className="crazy-wheel-wrap">
                      <svg viewBox="0 0 300 300" className="crazy-wheel" role="img" aria-label="Crazy Time bonus wheel">
                        <circle cx={WHEEL_C} cy={WHEEL_C} r={WHEEL_R + 3} className="crazy-wheel__bg" />

                        {crazyPlan.slots.map((slot, i) => (
                          <path
                            key={`w${i}`}
                            d={wedgePath(i, crazyPlan.slots.length)}
                            className={`crazy-slot ${
                              slot.kind === "double" ? "crazy-slot--double" : `crazy-slot--${slot.baseValue}`
                            } ${crazyHits.has(i) ? "is-hit" : ""}`}
                          />
                        ))}

                        {Array.from(crazyHits.entries()).map(([i, c]) => (
                          <path
                            key={`r${i}-${crazyDone}`}
                            d={wedgePath(i, crazyPlan.slots.length)}
                            className="crazy-slot__ring"
                            style={{ stroke: ARROW_HEX[c] }}
                          />
                        ))}

                        {crazyPlan.slots.map((slot, i) => {
                          const mid = ((i + 0.5) * 360) / crazyPlan.slots.length;
                          const label =
                            slot.kind === "double"
                              ? "x2"
                              : compact(slot.baseValue * resultBoost * crazyFactor);
                          return (
                            <text
                              key={`t${i}`}
                              x={WHEEL_C}
                              y={WHEEL_C - WHEEL_LABEL_R}
                              transform={`rotate(${mid.toFixed(2)} ${WHEEL_C} ${WHEEL_C}) rotate(-90 ${WHEEL_C} ${
                                WHEEL_C - WHEEL_LABEL_R
                              })`}
                              textAnchor="middle"
                              dominantBaseline="central"
                              fontSize={label.length > 4 ? 9 : 11}
                              className={`crazy-slot__label ${slot.kind === "double" ? "crazy-slot__label--double" : ""}`}
                            >
                              {label}
                            </text>
                          );
                        })}

                        <circle cx={WHEEL_C} cy={WHEEL_C} r={WHEEL_HUB - 2} className="crazy-wheel__hub" />
                        <text
                          key={crazyFactor}
                          x={WHEEL_C}
                          y={WHEEL_C}
                          className="crazy-wheel__hub-text"
                        >
                          {crazyFactor > 1 ? `x${crazyFactor}` : "CRAZY"}
                        </text>

                        {ARROW_ORDER.map((c) => (
                          <g
                            key={c}
                            ref={(el) => {
                              arrowRefs.current[c] = el;
                            }}
                            transform={`rotate(${crazyPlan.angles[c][0]} ${WHEEL_C} ${WHEEL_C})`}
                          >
                            <polygon
                              points={`${WHEEL_C},28 ${WHEEL_C - 12},4 ${WHEEL_C + 12},4`}
                              fill={ARROW_HEX[c]}
                              stroke={chosenArrow === c ? "#ffffff" : "#0b0e16"}
                              strokeWidth={chosenArrow === c ? 2.5 : 1.5}
                              strokeLinejoin="round"
                            />
                          </g>
                        ))}
                      </svg>
                    </div>
                  </>
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
                    const lastStep = landed[landed.length - 1];
                    const isPicked = chosenArrow === a.color;
                    const isTop = bonusDone && info.finalMult === highestCrazyMult;

                    // real values read from the wheel, no fake counting
                    const landedSlot = lastStep ? crazyPlan?.slots[lastStep.slot] : undefined;
                    const displayMult = bonusDone
                      ? `${info.finalMult}x`
                      : inCrazyPickPhase || crazyStageNow < 0
                        ? "READY"
                        : !landedSlot
                          ? "…"
                          : landedSlot.kind === "double"
                            ? "RESPIN"
                            : `${compact(landedSlot.baseValue * resultBoost * crazyFactor)}x`;

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