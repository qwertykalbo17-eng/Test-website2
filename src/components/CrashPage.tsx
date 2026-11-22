import { useEffect, useRef, useState, type ReactNode } from "react";
import { useCoin } from "../coin";
import type { CrashState } from "../types";

interface Props {
  state: CrashState | null;
  /** server clock minus this device's clock (ms) */
  offset: number;
  coins: number;
  loggedIn: boolean;
  busy: boolean;
  onLogin: () => void;
  onBet: (amount: number, autoCashout: number | null) => Promise<void>;
  onCashout: () => Promise<void>;
  /** Auto bet is on: your last bet is placed again at the start of every round (even on other pages) */
  autoBet: boolean;
  /** turn Auto bet on / off; the current amount and auto cash-out are what it will repeat */
  onToggleAutoBet: (amount: number, autoCashout: number | null) => void;
  /** reload the round */
  onRefresh: () => void;
  /** the round is over: reload the round and your coins */
  onRoundEnd: () => void;
}

type Phase = "loading" | "betting" | "flying" | "crashed";

/** Must match the database: multiplier = e^(RATE * seconds since launch). */
const RATE = 0.06;
const BETTING_SECONDS = 10;
/**
 * The page shows the flight this much behind the server. The crash point stays secret until the crash has
 * really happened and the page only learns it on its next poll (about 0.5 s + network). Without this delay
 * the counter ran past the crash point and then jumped back (2.00x, then "crashed at 1.97x"). With it the
 * counter never passes the crash point, so the crash lands exactly where the counter is.
 */
const DISPLAY_LAG_MS = 1000;
const ASTRO_W = 96;
const ASTRO_H = 120;

const multAt = (sec: number) => Math.floor(Math.exp(RATE * Math.max(0, sec)) * 100) / 100;
const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");

/** Heat to freeze: the live multiplier goes from deep red to ice blue as it climbs (log scale). */
const HEAT: [number, [number, number, number]][] = [
  [1, [255, 31, 31]],
  [2, [255, 77, 46]],
  [4, [255, 138, 61]],
  [8, [255, 217, 184]],
  [16, [191, 234, 255]],
  [40, [111, 211, 255]],
];

function heatColor(m: number): string {
  const x = Math.max(1, m);
  let rgb = HEAT[HEAT.length - 1][1];
  for (let i = 1; i < HEAT.length; i++) {
    if (x <= HEAT[i][0]) {
      const [m0, c0] = HEAT[i - 1];
      const [m1, c1] = HEAT[i];
      const t = (Math.log(x) - Math.log(m0)) / (Math.log(m1) - Math.log(m0));
      rgb = [0, 1, 2].map((k) => Math.round(c0[k] + (c1[k] - c0[k]) * t)) as [number, number, number];
      break;
    }
  }
  return `${rgb[0]},${rgb[1]},${rgb[2]}`;
}

function tierOf(m: number): string {
  if (m < 2) return "1";
  if (m < 5) return "2";
  if (m < 10) return "3";
  if (m < 25) return "4";
  return "5";
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  r: number;
  color: string;
}

/* ---------- the rocket (original design, drawn in code, points up) ---------- */

function Rocket() {
  const hull = "M60 6 C84 22 92 56 90 108 L30 108 C28 56 36 22 60 6 Z";
  return (
    <svg viewBox="0 0 120 150" width={ASTRO_W} height={ASTRO_H} aria-hidden="true" style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id="rk-hull" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#c9d1e6" />
          <stop offset="0.35" stopColor="#ffffff" />
          <stop offset="0.7" stopColor="#eef1fa" />
          <stop offset="1" stopColor="#a9b3cf" />
        </linearGradient>
        <linearGradient id="rk-nose" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#00b98a" />
          <stop offset="0.4" stopColor="#2dffc6" />
          <stop offset="1" stopColor="#00a47c" />
        </linearGradient>
        <linearGradient id="rk-fin" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#2dffc6" />
          <stop offset="1" stopColor="#008f6c" />
        </linearGradient>
        <radialGradient id="rk-glass" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#7fe9ff" />
          <stop offset="0.45" stopColor="#2a6fb0" />
          <stop offset="1" stopColor="#0d1530" />
        </radialGradient>
        <clipPath id="rk-clip">
          <path d={hull} />
        </clipPath>
      </defs>

      {/* flame: glow + three layers, streams out of the nozzle */}
      <g className="astro__flame">
        <ellipse cx="60" cy="136" rx="22" ry="30" fill="#ff7a2f" opacity="0.25" />
        <path d="M42 120 Q60 190 78 120 Z" fill="#ff5a1f" />
        <path d="M47 120 Q60 172 73 120 Z" fill="#ff9a3a" />
        <path d="M52 120 Q60 154 68 120 Z" fill="#ffd54a" />
        <path d="M56 120 Q60 138 64 120 Z" fill="#fff6d0" />
      </g>

      {/* side boosters */}
      <g>
        <path d="M24 70 C18 78 17 96 19 112 L33 112 L33 76 Z" fill="url(#rk-hull)" stroke="#a9b3cf" strokeWidth="1.2" />
        <path d="M24 70 C26 62 30 58 33 56 L33 76 Z" fill="#ff4d5e" />
        <rect x="19" y="104" width="14" height="8" rx="2" fill="#2b3350" />
        <path d="M96 70 C102 78 103 96 101 112 L87 112 L87 76 Z" fill="url(#rk-hull)" stroke="#a9b3cf" strokeWidth="1.2" />
        <path d="M96 70 C94 62 90 58 87 56 L87 76 Z" fill="#ff4d5e" />
        <rect x="87" y="104" width="14" height="8" rx="2" fill="#2b3350" />
      </g>

      {/* big fins */}
      <path d="M34 78 L8 126 L12 132 L38 118 Z" fill="url(#rk-fin)" stroke="#007a5c" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M86 78 L112 126 L108 132 L82 118 Z" fill="url(#rk-fin)" stroke="#007a5c" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M34 90 L16 124" stroke="#9ffbe3" strokeWidth="1.4" opacity="0.6" />
      <path d="M86 90 L104 124" stroke="#9ffbe3" strokeWidth="1.4" opacity="0.6" />

      {/* engine nozzle with ribs */}
      <path d="M42 108 L38 122 Q60 128 82 122 L78 108 Z" fill="#2b3350" />
      <path d="M42 108 L38 122 Q60 128 82 122 L78 108 Z" fill="none" stroke="#5a6690" strokeWidth="1.2" />
      <path d="M48 110 L46 124 M60 110 L60 127 M72 110 L74 124" stroke="#5a6690" strokeWidth="1.2" opacity="0.8" />

      {/* hull */}
      <path d={hull} fill="url(#rk-hull)" />
      <g clipPath="url(#rk-clip)">
        {/* nose cone */}
        <rect x="20" y="0" width="80" height="40" fill="url(#rk-nose)" />
        <path d="M24 40 Q60 48 96 40" stroke="#007a5c" strokeWidth="2.5" fill="none" />
        {/* stripe bands near the engine */}
        <rect x="20" y="88" width="80" height="7" fill="url(#rk-nose)" />
        <rect x="20" y="97" width="80" height="3" fill="#ff4d5e" />
        {/* panel lines + rivets */}
        <path d="M60 40 L60 56 M60 96 L60 108" stroke="#a9b3cf" strokeWidth="1.2" />
        <path d="M30 80 L90 80" stroke="#c4cce0" strokeWidth="1" />
        {[38, 48, 72, 82].map((x) => (
          <circle key={x} cx={x} cy="84" r="1.5" fill="#9aa5c4" />
        ))}
        {/* soft shadow on the right side + highlight on the left */}
        <rect x="74" y="0" width="30" height="120" fill="#0d1530" opacity="0.12" />
        <path d="M40 30 C36 50 36 78 38 100" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.7" />
      </g>
      <path d={hull} fill="none" stroke="#a9b3cf" strokeWidth="2" />

      {/* porthole */}
      <circle cx="60" cy="62" r="17" fill="#8d98b8" />
      <circle cx="60" cy="62" r="14.5" fill="#dfe4f2" stroke="#6b7699" strokeWidth="1" />
      <circle cx="60" cy="62" r="11.5" fill="url(#rk-glass)" />
      <path d="M52 58 Q55 52 62 52" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" fill="none" opacity="0.85" />
      {[0, 60, 120, 180, 240, 300].map((deg) => (
        <circle key={deg} cx={60 + 16 * Math.cos((deg * Math.PI) / 180)} cy={62 + 16 * Math.sin((deg * Math.PI) / 180)} r="1.1" fill="#6b7699" />
      ))}

      {/* little star badge */}
      <path d="M60 24 L62.2 29 L67.5 29.4 L63.4 32.8 L64.8 38 L60 35.2 L55.2 38 L56.6 32.8 L52.5 29.4 L57.8 29 Z" fill="#ffffff" opacity="0.9" />
    </svg>
  );
}

/* ---------- the page ---------- */

export default function CrashPage({ state, offset, loggedIn, busy, onLogin, onBet, onCashout, autoBet, onToggleAutoBet, onRefresh, onRoundEnd }: Props) {
  const coin = useCoin();
  const [amount, setAmount] = useState("");
  const [auto, setAuto] = useState("");
  const [phase, setPhase] = useState<Phase>("loading");
  const [floaters, setFloaters] = useState<{ key: number; x: number; y: number; mult: number }[]>([]);

  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const astroRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const cashRef = useRef<HTMLSpanElement>(null);

  const stateRef = useRef<CrashState | null>(state);
  stateRef.current = state;
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const phaseRef = useRef<Phase>("loading");
  const posRef = useRef({ x: 0, y: 0 });
  const multRef = useRef(1);

  /* ----- the animation loop: stars, flame trail, astronaut, counter ----- */
  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    const astro = astroRef.current;
    if (!stage || !canvas || !astro) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let dpr = 1;
    const resize = () => {
      const r = stage.getBoundingClientRect();
      w = r.width;
      h = r.height;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(stage);

    const stars = Array.from({ length: 110 }, () => ({ x: Math.random(), y: Math.random(), z: Math.random() }));
    const parts: Particle[] = [];
    let ring = -1;
    let ringX = 0;
    let ringY = 0;
    let prev: Phase = "loading";
    let last = performance.now();
    let raf = 0;
    let shakeTimer: ReturnType<typeof setTimeout> | undefined;

    const shake = (cls: string, ms: number) => {
      stage.classList.add(cls);
      clearTimeout(shakeTimer);
      shakeTimer = setTimeout(() => stage.classList.remove(cls), ms);
    };

    const frame = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const s = stateRef.current;
      const n = Date.now() + offsetRef.current;

      let ph: Phase = "loading";
      let m = 1;
      let secsLeft = 0;
      if (s) {
        if (n < s.betting_ends_at) {
          ph = "betting";
          secsLeft = (s.betting_ends_at - n) / 1000;
        } else {
          // what the page shows is DISPLAY_LAG_MS behind the server, so the crash is always known in time
          const el = Math.max(0, (n - s.betting_ends_at - DISPLAY_LAG_MS) / 1000);
          if (s.crashed && s.crash_point != null && el >= Math.log(Math.max(1, s.crash_point)) / RATE) {
            ph = "crashed";
            m = s.crash_point;
          } else {
            ph = "flying";
            m = multAt(el);
            if (s.crash_point != null) m = Math.min(m, s.crash_point);
          }
        }
      }
      multRef.current = m;

      // position of the astronaut: starts bottom-left, sweeps to the right, then climbs slowly
      // as the multiplier grows (all the way up at the 15000x cap)
      const lnM = Math.log(Math.max(1, m));
      // one straight diagonal, bottom-left to top-right, no wiggle
      const prog = 1 - Math.exp(-lnM / 2.2);
      const wob = ph === "betting" ? Math.sin(t / 500) * 6 : 0;
      // the real direction of travel on screen: from the pad (bottom-left) to the top-right end of the path.
      // The rocket, its flame and the star streaks all follow this one angle, whatever the stage's shape.
      const tvx = 0.84 * w;
      const tvy = -0.72 * h;
      const tlen = Math.hypot(tvx, tvy) || 1;
      const ux = tvx / tlen;
      const uy = tvy / tlen;
      const flightTilt = (Math.atan2(ux, -uy) * 180) / Math.PI; // degrees from straight up
      if (ph !== "crashed") {
        posRef.current = { x: w * (0.08 + 0.84 * prog), y: h * (0.86 - 0.72 * prog) + wob };
      }
      const { x: px, y: py } = posRef.current;
      // leans into the flight: nearly sideways at first, more upright as it climbs
      const tilt = ph === "betting" ? 4 : flightTilt;
      const rot = ph === "betting" || ph === "loading" ? 4 : tilt; // the rocket points up, so it turns by the flight angle
      astro.style.transform = `translate(${px - ASTRO_W / 2}px, ${py - ASTRO_H / 2}px) rotate(${rot}deg)`;

      // phase changes
      if (ph !== prev) {
        stage.dataset.phase = ph;
        if (ph === "flying" && prev === "betting") {
          // lift-off: smoke puff from the pad + a short shake
          for (let i = 0; i < 34; i++) {
            const a = Math.random() * Math.PI;
            parts.push({
              x: px + (Math.random() - 0.5) * 50,
              y: py + ASTRO_H * 0.5,
              vx: Math.cos(a) * (60 + Math.random() * 160) * (Math.random() < 0.5 ? -1 : 1),
              vy: -Math.sin(a) * 40 + 30,
              life: 0.9,
              max: 0.9,
              r: 6 + Math.random() * 9,
              color: "190,198,220",
            });
          }
          shake("is-shake-soft", 450);
        }
        if (ph === "crashed") {
          // explosion
          ring = 0;
          ringX = px;
          ringY = py;
          for (let i = 0; i < 80; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = 80 + Math.random() * 420;
            const colors = ["255,122,47", "255,213,74", "255,246,208", "244,114,182", "0,245,180"];
            parts.push({
              x: px,
              y: py,
              vx: Math.cos(a) * sp,
              vy: Math.sin(a) * sp,
              life: 0.7 + Math.random() * 0.9,
              max: 1.6,
              r: 2 + Math.random() * 5,
              color: colors[Math.floor(Math.random() * colors.length)],
            });
          }
          shake("is-shake", 600);
        }
        prev = ph;
        if (phaseRef.current !== ph) {
          phaseRef.current = ph;
          setPhase(ph);
        }
      }

      // counter
      const counter = counterRef.current;
      const sub = subRef.current;
      if (counter && sub) {
        if (ph !== "flying") {
          counter.style.color = "";
          counter.style.textShadow = "";
        }
        if (ph === "betting") {
          counter.textContent = `${secsLeft.toFixed(1)}s`;
          counter.dataset.tier = "idle";
          sub.textContent = "LIFT-OFF IN";
        } else if (ph === "flying") {
          counter.textContent = `${m.toFixed(2)}x`;
          counter.dataset.tier = tierOf(m);
          const heat = heatColor(m);
          counter.style.color = `rgb(${heat})`;
          counter.style.textShadow = `0 0 28px rgba(${heat},0.6)`;
          sub.textContent = "";
        } else if (ph === "crashed") {
          counter.textContent = `${m.toFixed(2)}x`;
          counter.dataset.tier = "crashed";
          sub.textContent = "CRASHED";
        } else {
          counter.textContent = "…";
          counter.dataset.tier = "idle";
          sub.textContent = "";
        }
      }
      const bar = barRef.current;
      if (bar) {
        bar.style.width = ph === "betting" ? `${Math.min(100, (secsLeft / BETTING_SECONDS) * 100)}%` : "0%";
      }
      const cash = cashRef.current;
      if (cash && s?.mine && ph === "flying") {
        cash.textContent = `${fmt(s.mine.amount * m)}`;
      }

      // background: stars rush past faster the higher the multiplier gets
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const rush = Math.min(1, lnM / Math.log(100));
      const speed = ph === "flying" ? 0.16 + 0.34 * rush : ph === "betting" ? 0.012 : 0;
      for (const st of stars) {
        const f = 0.25 + st.z * 0.9;
        // stars drift against the direction the rocket flies
        const move = speed * f * dt * Math.max(w, 1);
        st.x -= (ux * move) / Math.max(w, 1);
        st.y -= (uy * move) / Math.max(h, 1);
        if (st.y > 1) {
          st.y -= 1;
          st.x = Math.random();
        }
        if (st.x < 0) {
          st.x += 1;
          st.y = Math.random();
        }
        const sx = st.x * w;
        const sy = st.y * h;
        ctx.strokeStyle = `rgba(255,255,255,${0.25 + st.z * 0.6})`;
        ctx.lineWidth = 0.7 + st.z * 1.3;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        const len = speed * 90 * f;
        ctx.lineTo(sx + ux * len, sy + uy * len);
        if (len < 1.5) ctx.lineTo(sx + 0.01, sy - 0.01);
        ctx.stroke();
      }

      // flame trail while flying
      if (ph === "flying") {
        const th = (tilt * Math.PI) / 180;
        const fx = px - Math.sin(th) * (ASTRO_H * 0.42);
        const fy = py + Math.cos(th) * (ASTRO_H * 0.42);
        for (let i = 0; i < 3; i++) {
          const away = 110 + Math.random() * 120; // opposite to the direction of flight
          parts.push({
            x: fx + (Math.random() - 0.5) * 10,
            y: fy + (Math.random() - 0.5) * 10,
            vx: -Math.sin(th) * away + (Math.random() - 0.5) * 30,
            vy: Math.cos(th) * away + (Math.random() - 0.5) * 30 + 20,
            life: 0.45 + Math.random() * 0.4,
            max: 0.85,
            r: 3 + Math.random() * 5,
            color: Math.random() < 0.5 ? "255,160,60" : "255,224,120",
          });
        }
      }

      // particles
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life -= dt;
        if (p.life <= 0) {
          parts.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.985;
        const k = p.life / p.max;
        ctx.fillStyle = `rgba(${p.color},${Math.min(1, k * 1.2)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, p.r * (0.4 + k * 0.6)), 0, Math.PI * 2);
        ctx.fill();
      }

      // shockwave
      if (ring >= 0) {
        ring += dt;
        if (ring > 0.7) ring = -1;
        else {
          ctx.strokeStyle = `rgba(255,255,255,${1 - ring / 0.7})`;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(ringX, ringY, ring * 520, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(shakeTimer);
      ro.disconnect();
    };
  }, []);

  /* ----- reload the round right when it launches and right after it ends ----- */
  useEffect(() => {
    if (!state) return;
    const local = () => Date.now() + offsetRef.current;
    const t1 = setTimeout(onRefresh, Math.max(0, state.betting_ends_at - local()) + 80);
    const t2 = setTimeout(onRoundEnd, Math.max(0, state.ends_at - local()) + 300);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.id, state?.betting_ends_at, state?.ends_at]);

  /* ----- when you cash out, a little astronaut floats away happily ----- */
  const prevMine = useRef<{ id: number; cashed: number | null } | null>(null);
  const floaterKey = useRef(0);
  useEffect(() => {
    if (!state) return;
    const cashed = state.mine?.cashed_mult ?? null;
    const prev = prevMine.current;
    if (prev && prev.id === state.id && prev.cashed == null && cashed != null && phaseRef.current === "flying") {
      const key = ++floaterKey.current;
      setFloaters((f) => [...f, { key, x: posRef.current.x, y: posRef.current.y, mult: cashed }]);
      setTimeout(() => setFloaters((f) => f.filter((x) => x.key !== key)), 3200);
    }
    prevMine.current = { id: state.id, cashed };
  }, [state]);

  /* ----- betting ----- */
  const amountNum = Math.floor(Number(amount.replace(/[^0-9]/g, "")) || 0);
  const autoNum = Number(auto);
  const autoValue = auto.trim() !== "" && Number.isFinite(autoNum) && autoNum > 0 ? autoNum : null;
  const mine = state?.mine ?? null;
  const cashed = mine?.cashed_mult != null;

  function setAmt(n: number) {
    setAmount(n > 0 ? String(Math.floor(n)) : "");
  }

  let action: ReactNode;
  if (!loggedIn) {
    action = (
      <button className="btn btn--primary crash-go" onClick={onLogin}>
        LOG IN TO BET
      </button>
    );
  } else if (phase === "betting" && !mine) {
    action = (
      <button className="btn btn--primary crash-go" disabled={busy || amountNum < 1} onClick={() => onBet(amountNum, autoValue)}>
        PLACE BET
      </button>
    );
  } else if (phase === "betting" && mine) {
    action = (
      <button className="btn crash-go" disabled>
        BET PLACED · {coin} {fmt(mine.amount)}
        {mine.auto != null ? ` · auto ${mine.auto}x` : ""}
      </button>
    );
  } else if (phase === "flying" && mine && !cashed) {
    action = (
      <button className="btn btn--primary crash-go crash-go--cash" disabled={busy} onClick={() => onCashout()}>
        CASH OUT · {coin} <span ref={cashRef}>{fmt(mine.amount)}</span>
      </button>
    );
  } else if (cashed && mine) {
    action = (
      <button className="btn crash-go crash-go--won" disabled>
        CASHED OUT {mine.cashed_mult}x · +{coin} {fmt(mine.payout)}
      </button>
    );
  } else if (phase === "crashed" && mine) {
    action = (
      <button className="btn crash-go crash-go--lost" disabled>
        YOU LOST {coin} {fmt(mine.amount)}
      </button>
    );
  } else {
    action = (
      <button className="btn crash-go" disabled>
        WAITING FOR THE NEXT ROUND
      </button>
    );
  }

  return (
    <>
      <div className="crash-top">
        <div className="crash-history" aria-label="Previous crash points">
          {(state?.history ?? []).slice(0, 14).map((h) => (
            <span
              key={h.id}
              className={`chist ${h.crash_point >= 10 ? "chist--big" : h.crash_point >= 2 ? "chist--mid" : "chist--low"}`}
            >
              {h.crash_point.toFixed(2)}x
            </span>
          ))}
        </div>
        <span className="crash-totals">
          {state ? `${state.totals.players} bet${state.totals.players === 1 ? "" : "s"} · ${coin} ${fmt(state.totals.coins)}` : ""}
        </span>
      </div>

      <section className="panel crash">
        <div className="crash-stage" ref={stageRef} data-phase="loading">
          <div className="crash-stage__planet" aria-hidden="true" />
          <canvas ref={canvasRef} className="crash-stage__canvas" />
          <div className="crash-stage__pad" aria-hidden="true" />

          <div className="crash-readout">
            <div className="crash-readout__sub" ref={subRef} />
            <div className="crash-readout__mult" ref={counterRef} data-tier="idle">
              …
            </div>
            <div className="crash-readout__bar">
              <div ref={barRef} />
            </div>
          </div>

          <div className="astro" ref={astroRef} style={{ width: ASTRO_W, height: ASTRO_H }}>
            <div className="astro__body">
              <Rocket />
            </div>
          </div>

          {floaters.map((f) => (
            <div key={f.key} className="floater" style={{ left: f.x - 30, top: f.y - 36 }}>
              <div className="floater__tag">{f.mult}x</div>
              <div className="floater__body">
                <Rocket />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel crash-bet">
        <div className="crash-bet__row">
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
          <div className="wheel-bet__input crash-bet__auto">
            <span className="wheel-bet__coin">⏱</span>
            <input
              className="input"
              inputMode="decimal"
              placeholder="Auto cash-out"
              value={auto}
              onChange={(e) => setAuto(e.target.value.replace(/[^0-9.]/g, ""))}
            />
          </div>
        </div>
        <div className="wheel-bet__chips crash-bet__chips">
          <button className="chip-btn" onClick={() => setAmt(amountNum + 10)}>+10</button>
          <button className="chip-btn" onClick={() => setAmt(amountNum + 100)}>+100</button>
          <button className="chip-btn" onClick={() => setAmt(amountNum + 1000)}>+1K</button>
          <button className="chip-btn" onClick={() => setAmt(amountNum / 2)}>½</button>
          <button className="chip-btn" onClick={() => setAmt(amountNum * 2)}>2×</button>
          <button
            className={`chip-btn chip-btn--auto ${autoBet ? "is-on" : ""}`}
            onClick={() => onToggleAutoBet(amountNum, autoValue)}
            title="Place your bet again automatically at the start of every round"
          >
            Auto bet {autoBet ? "ON" : "OFF"}
          </button>
          <button className="chip-btn chip-btn--clear" onClick={() => setAmt(0)}>Clear</button>
        </div>
        {action}
      </section>
    </>
  );
}