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
const ASTRO_W = 84;
const ASTRO_H = 98;

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

/* ---------- the monkey astronaut (original design, drawn in code) ---------- */

function Rocket() {
  return (
    <svg viewBox="0 0 120 140" width={ASTRO_W} height={ASTRO_H} aria-hidden="true">
      {/* two thruster flames (one per side of the jetpack) */}
      <g className="astro__flame" style={{ transformOrigin: "35px 106px" }}>
        <path d="M29 106 Q35 160 41 106 Z" fill="#ff7a2f" />
        <path d="M31.5 106 Q35 142 38.5 106 Z" fill="#ffd54a" />
        <path d="M33.5 106 Q35 126 36.5 106 Z" fill="#fff6d0" />
      </g>
      <g className="astro__flame" style={{ transformOrigin: "85px 106px" }}>
        <path d="M79 106 Q85 160 91 106 Z" fill="#ff7a2f" />
        <path d="M81.5 106 Q85 142 88.5 106 Z" fill="#ffd54a" />
        <path d="M83.5 106 Q85 126 86.5 106 Z" fill="#fff6d0" />
      </g>
      {/* jetpack, peeking out behind the body */}
      <rect x="27" y="70" width="16" height="30" rx="5" fill="#9aa3c0" />
      <rect x="77" y="70" width="16" height="30" rx="5" fill="#9aa3c0" />
      <rect x="29" y="98" width="12" height="9" rx="3" fill="#2b3350" />
      <rect x="79" y="98" width="12" height="9" rx="3" fill="#2b3350" />
      <rect x="31" y="100" width="8" height="5" rx="2" fill="#ffcf4a" />
      <rect x="81" y="100" width="8" height="5" rx="2" fill="#ffcf4a" />
      {/* legs + boots */}
      <rect x="44" y="96" width="14" height="22" rx="6" fill="#f4f6fc" />
      <rect x="62" y="96" width="14" height="22" rx="6" fill="#f4f6fc" />
      <rect x="42" y="113" width="18" height="11" rx="5" fill="#dfe4f2" />
      <rect x="60" y="113" width="18" height="11" rx="5" fill="#dfe4f2" />
      <rect x="42" y="120" width="18" height="4" rx="2" fill="#2b3350" />
      <rect x="60" y="120" width="18" height="4" rx="2" fill="#2b3350" />
      {/* body */}
      <rect x="39" y="60" width="42" height="42" rx="15" fill="#f4f6fc" />
      <rect x="70" y="62" width="11" height="38" rx="5" fill="#cfd6ea" opacity="0.55" />
      {/* harness: two black straps, a silver buckle and a belt */}
      <path d="M45 64 L58 84" stroke="#141a2c" strokeWidth="5" strokeLinecap="round" fill="none" />
      <path d="M75 64 L62 84" stroke="#141a2c" strokeWidth="5" strokeLinecap="round" fill="none" />
      <rect x="39" y="93" width="42" height="6" rx="3" fill="#141a2c" />
      <rect x="55" y="79" width="10" height="9" rx="2.5" fill="#c6cde0" stroke="#141a2c" strokeWidth="1.5" />
      {/* arm down (right side of the picture) */}
      <path d="M78 68 Q90 78 84 91" stroke="#cfd6ea" strokeWidth="14" strokeLinecap="round" fill="none" />
      <path d="M78 68 Q90 78 84 91" stroke="#f4f6fc" strokeWidth="11" strokeLinecap="round" fill="none" />
      <circle cx="84" cy="94" r="6.5" fill="#dfe4f2" />
      {/* arm up, waving */}
      <path d="M42 68 Q28 64 26 50" stroke="#cfd6ea" strokeWidth="14" strokeLinecap="round" fill="none" />
      <path d="M42 68 Q28 64 26 50" stroke="#f4f6fc" strokeWidth="11" strokeLinecap="round" fill="none" />
      <circle cx="26" cy="46" r="7" fill="#dfe4f2" />
      <path d="M21 41 L19 35 M26 39 L26 32 M31 41 L33 35" stroke="#dfe4f2" strokeWidth="3.5" strokeLinecap="round" />
      {/* helmet shell */}
      <circle cx="60" cy="36" r="29" fill="#f4f6fc" stroke="#cfd6ea" strokeWidth="2" />
      {/* monkey: ears, fur, face mask, eyes, grin */}
      <circle cx="40" cy="38" r="6.5" fill="#b5652f" />
      <circle cx="80" cy="38" r="6.5" fill="#b5652f" />
      <circle cx="40" cy="38" r="3.4" fill="#f0b98a" />
      <circle cx="80" cy="38" r="3.4" fill="#f0b98a" />
      <circle cx="60" cy="36" r="21" fill="#c8743a" />
      <path d="M53 16 Q60 8 67 16 Q60 13 53 16 Z" fill="#a85a26" />
      <circle cx="54" cy="35" r="9.5" fill="#f6d3a8" />
      <circle cx="66" cy="35" r="9.5" fill="#f6d3a8" />
      <ellipse cx="60" cy="45" rx="13" ry="9" fill="#f6d3a8" />
      <circle cx="54.5" cy="34" r="3" fill="#141a2c" />
      <circle cx="65.5" cy="34" r="3" fill="#141a2c" />
      <circle cx="55.4" cy="33" r="1" fill="#ffffff" />
      <circle cx="66.4" cy="33" r="1" fill="#ffffff" />
      <path d="M49 29 Q54 26 58 29" stroke="#8a4a1f" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <path d="M62 29 Q66 26 71 29" stroke="#8a4a1f" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <circle cx="58" cy="41" r="1" fill="#8a4a1f" />
      <circle cx="62" cy="41" r="1" fill="#8a4a1f" />
      <path d="M49 45 Q60 58 71 45 Z" fill="#ffffff" stroke="#6b3516" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M60 46 L60 53 M54 46 L54.5 51.5 M66 46 L65.5 51.5" stroke="#6b3516" strokeWidth="1" />
      {/* blue helmet rim + glass shine */}
      <circle cx="60" cy="36" r="24" fill="none" stroke="#3aa0ff" strokeWidth="4.5" />
      <path d="M41 24 Q46 15 58 13" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.75" />
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
      astro.style.transform = `translate(${px - ASTRO_W / 2}px, ${py - ASTRO_H / 2}px) rotate(${tilt}deg)`;

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
        const fx = px - Math.sin(th) * 62;
        const fy = py + Math.cos(th) * 62;
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

          <div className="astro" ref={astroRef}>
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