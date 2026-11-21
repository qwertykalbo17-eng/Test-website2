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
  /** reload the round */
  onRefresh: () => void;
  /** the round is over: reload the round and your coins */
  onRoundEnd: () => void;
}

type Phase = "loading" | "betting" | "flying" | "crashed";

/** Must match the database: multiplier = e^(RATE * seconds since launch). */
const RATE = 0.1;
const BETTING_SECONDS = 10;
/** The crash point is capped here (same cap in crash.sql). */
const CRASH_MAX = 15000;
const ASTRO_W = 84;
const ASTRO_H = 98;

const multAt = (sec: number) => Math.floor(Math.exp(RATE * Math.max(0, sec)) * 100) / 100;
const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");

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

/* ---------- the astronaut (original character, drawn in code) ---------- */

function Astronaut() {
  return (
    <svg viewBox="0 0 120 140" width={ASTRO_W} height={ASTRO_H} aria-hidden="true">
      {/* flame */}
      <g className="astro__flame">
        <path d="M44 112 Q60 170 76 112 Z" fill="#ff7a2f" />
        <path d="M50 112 Q60 150 70 112 Z" fill="#ffd54a" />
        <path d="M55 112 Q60 134 65 112 Z" fill="#fff6d0" />
      </g>
      {/* backpack */}
      <rect x="26" y="56" width="68" height="52" rx="14" fill="#2b3350" />
      <rect x="36" y="104" width="12" height="9" rx="3" fill="#424c73" />
      <rect x="72" y="104" width="12" height="9" rx="3" fill="#424c73" />
      {/* legs + boots */}
      <rect x="40" y="92" width="16" height="22" rx="7" fill="#e9edf7" />
      <rect x="64" y="92" width="16" height="22" rx="7" fill="#e9edf7" />
      <rect x="38" y="106" width="20" height="10" rx="5" fill="#00f5b4" />
      <rect x="62" y="106" width="20" height="10" rx="5" fill="#00f5b4" />
      {/* body */}
      <rect x="32" y="58" width="56" height="42" rx="18" fill="#f4f6fc" />
      <rect x="32" y="76" width="56" height="7" fill="#00f5b4" opacity="0.9" />
      <circle cx="60" cy="68" r="4.5" fill="#00f5b4" />
      {/* arms */}
      <g className="astro__arm astro__arm--l">
        <rect x="14" y="62" width="22" height="13" rx="6.5" fill="#e9edf7" />
        <circle cx="16" cy="69" r="7" fill="#00f5b4" />
      </g>
      <g className="astro__arm astro__arm--r">
        <rect x="84" y="62" width="22" height="13" rx="6.5" fill="#e9edf7" />
        <circle cx="104" cy="69" r="7" fill="#00f5b4" />
      </g>
      {/* helmet */}
      <circle cx="60" cy="38" r="31" fill="#f4f6fc" />
      <circle cx="60" cy="38" r="31" fill="none" stroke="#cfd6ea" strokeWidth="2" />
      <rect x="35" y="22" width="50" height="33" rx="16" fill="#141a2c" />
      <path d="M42 30 Q47 25 56 25" stroke="#7fe9ff" strokeWidth="3.2" strokeLinecap="round" fill="none" opacity="0.85" />
      <circle cx="68" cy="45" r="2.2" fill="#7fe9ff" opacity="0.6" />
      {/* antenna */}
      <rect x="58.5" y="2" width="3" height="9" rx="1.5" fill="#cfd6ea" />
      <circle cx="60" cy="3" r="4" fill="#00f5b4" />
    </svg>
  );
}

/* ---------- the page ---------- */

export default function CrashPage({ state, offset, coins, loggedIn, busy, onLogin, onBet, onCashout, onRefresh, onRoundEnd }: Props) {
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
        } else if (s.crashed && s.crash_point != null) {
          ph = "crashed";
          m = s.crash_point;
        } else {
          ph = "flying";
          m = multAt((n - s.betting_ends_at) / 1000);
          if (s.crash_point != null) m = Math.min(m, s.crash_point);
        }
      }
      multRef.current = m;

      // position of the astronaut: starts bottom-left, sweeps to the right, then climbs slowly
      // as the multiplier grows (all the way up at the 15000x cap)
      const lnM = Math.log(Math.max(1, m));
      const xp = 1 - Math.exp(-lnM / 0.9); // ~half way across at 2x, almost there by 10x
      const prog = Math.min(1, lnM / Math.log(CRASH_MAX)); // slow climb
      const wob = ph === "flying" ? Math.sin(t / 260) * 4 : ph === "betting" ? Math.sin(t / 500) * 6 : 0;
      if (ph !== "crashed") {
        posRef.current = { x: w * (0.14 + 0.6 * xp), y: h * (0.8 - 0.5 * prog) + wob };
      }
      const { x: px, y: py } = posRef.current;
      // leans into the flight: nearly sideways at first, more upright as it climbs
      const tilt = ph === "flying" ? 68 - 26 * prog : ph === "betting" ? 4 : 50;
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
        if (ph === "betting") {
          counter.textContent = `${secsLeft.toFixed(1)}s`;
          counter.dataset.tier = "idle";
          sub.textContent = "LIFT-OFF IN";
        } else if (ph === "flying") {
          counter.textContent = `${m.toFixed(2)}x`;
          counter.dataset.tier = tierOf(m);
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
        st.x -= speed * f * dt;
        st.y += speed * 0.2 * f * dt;
        if (st.y > 1) st.y -= 1;
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
        ctx.lineTo(sx + len, sy - len * 0.2);
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
              <Astronaut />
            </div>
          </div>

          {floaters.map((f) => (
            <div key={f.key} className="floater" style={{ left: f.x - 30, top: f.y - 36 }}>
              <div className="floater__tag">{f.mult}x</div>
              <div className="floater__body">
                <Astronaut />
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
              placeholder="Auto cash-out (e.g. 2.5)"
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
          <button className="chip-btn" onClick={() => setAmt(coins)}>Max</button>
          <button className="chip-btn chip-btn--clear" onClick={() => setAmt(0)}>Clear</button>
        </div>
        {action}
      </section>
    </>
  );
}