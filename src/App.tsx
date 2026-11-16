import { useEffect, useRef, useState } from "react";
import { IntroScene } from "./intro/IntroScene";
import { LOGO_PARTS } from "./intro/logo";
import { BRAND, TL } from "./intro/config";
import { clamp, smoothstep } from "./intro/math";

function LogoSvg({ fill, shineRef }: { fill: string; shineRef?: React.Ref<SVGLinearGradientElement> }) {
  return (
    <>
      {shineRef !== undefined && (
        <defs>
          <linearGradient
            ref={shineRef}
            id="shine"
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1="0"
            x2="46"
            y2="0"
            gradientTransform="translate(-120,0) skewX(-22)"
          >
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="1" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
      )}
      {LOGO_PARTS.map((p, i) =>
        p.kind === "fill" ? (
          <path key={i} d={p.d} fill={fill} fillRule={p.evenodd ? "evenodd" : "nonzero"} opacity={p.opacity ?? 1} />
        ) : (
          <path
            key={i}
            d={p.d}
            fill="none"
            stroke={fill}
            strokeWidth={p.width}
            strokeLinecap="round"
            opacity={p.opacity ?? 1}
          />
        )
      )}
    </>
  );
}

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<IntroScene | null>(null);
  const topBar = useRef<HTMLDivElement>(null);
  const botBar = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const shineRef = useRef<SVGLinearGradientElement>(null);
  const wordRef = useRef<HTMLDivElement>(null);
  const tagRef = useRef<HTMLDivElement>(null);
  const ruleRef = useRef<HTMLDivElement>(null);
  const progRef = useRef<HTMLDivElement>(null);
  const shadeRef = useRef<HTMLDivElement>(null);
  const [ended, setEnded] = useState(false);
  const endedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    let scene: IntroScene | null = null;
    try {
      scene = new IntroScene(el, (t) => {
        const W = window.innerWidth;
        const H = window.innerHeight;
        const base = Math.max(0, (H - W / 2.39) / 2);
        const open = 1 - Math.pow(1 - clamp(t / 2.6), 3);
        const bar = base + (1 - open) * H * 0.22;
        if (topBar.current) topBar.current.style.height = bar + "px";
        if (botBar.current) botBar.current.style.height = bar + "px";

        // logo
        const o = smoothstep(TL.LOGO_IN, TL.LOGO_IN + 1.5, t);
        if (logoRef.current) {
          const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
          logoRef.current.style.opacity = String(o);
          logoRef.current.style.transform = `translate(-50%,-50%) scale(${1 + (1 - o) * 0.06})`;
          logoRef.current.style.filter = `blur(${(1 - o) * 10}px) drop-shadow(0 0 ${14 + pulse * 10}px rgba(255,165,40,${
            0.5 * o
          }))`;
        }
        if (shadeRef.current) shadeRef.current.style.opacity = String(o);
        if (shineRef.current) {
          const g = clamp((t - (TL.LOGO_IN + 1.6)) / 1.7);
          shineRef.current.setAttribute("gradientTransform", `translate(${-90 + g * 330},0) skewX(-22)`);
        }
        const w = smoothstep(TL.LOGO_IN + 0.7, TL.LOGO_IN + 3.0, t);
        if (wordRef.current) {
          const ls = 0.95 - 0.55 * w;
          wordRef.current.style.opacity = String(w);
          wordRef.current.style.letterSpacing = ls + "em";
          wordRef.current.style.marginRight = -ls + "em";
          wordRef.current.style.filter = `blur(${(1 - w) * 8}px)`;
        }
        const tg = smoothstep(TL.LOGO_IN + 1.8, TL.LOGO_IN + 3.4, t);
        if (tagRef.current) {
          tagRef.current.style.opacity = String(tg * 0.85);
          tagRef.current.style.transform = `translateY(${(1 - tg) * 8}px)`;
        }
        if (ruleRef.current) ruleRef.current.style.transform = `scaleX(${tg})`;
        if (progRef.current) progRef.current.style.transform = `scaleX(${clamp(t / TL.END)})`;

        const isEnd = t >= TL.END - 0.5;
        if (isEnd !== endedRef.current) {
          endedRef.current = isEnd;
          setEnded(isEnd);
        }
      });
      sceneRef.current = scene;
    } catch (e) {
      console.error(e);
      setError("WebGL недоступен в этом браузере.");
    }
    return () => {
      scene?.dispose();
      sceneRef.current = null;
    };
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-black select-none">
      <div ref={mountRef} className="absolute inset-0" />

      {/* cinematic letterbox */}
      <div ref={topBar} className="absolute left-0 right-0 top-0 bg-black z-10 pointer-events-none" style={{ height: "22vh" }} />
      <div ref={botBar} className="absolute left-0 right-0 bottom-0 bg-black z-10 pointer-events-none" style={{ height: "22vh" }}>
        <div className="absolute left-0 right-0 bottom-0 h-px bg-white/10">
          <div
            ref={progRef}
            className="h-full origin-left"
            style={{
              transform: "scaleX(0)",
              background: "linear-gradient(90deg, rgba(255,170,50,0), #ffcf6b)",
              boxShadow: "0 0 8px rgba(255,190,80,0.9)",
            }}
          />
        </div>
      </div>

      {/* logo + wordmark */}
      <div className="absolute inset-0 z-20 pointer-events-none">
        <div
          ref={shadeRef}
          className="absolute inset-0"
          style={{
            opacity: 0,
            background:
              "radial-gradient(ellipse 38% 46% at 50% 54%, rgba(8,3,0,0.7) 0%, rgba(8,3,0,0.45) 55%, rgba(8,3,0,0) 100%)",
          }}
        />
        <div
          ref={logoRef}
          className="absolute"
          style={{ left: "50%", top: "44%", height: "42vh", width: "42vh", opacity: 0, transform: "translate(-50%,-50%)" }}
        >
          <svg viewBox="0 0 200 200" width="100%" height="100%" overflow="visible">
            <defs>
              <linearGradient id="gold" x1="0" y1="0" x2="0.35" y2="1">
                <stop offset="0" stopColor="#fff6cf" />
                <stop offset="0.28" stopColor="#ffd666" />
                <stop offset="0.55" stopColor="#f0a521" />
                <stop offset="0.8" stopColor="#ffe08a" />
                <stop offset="1" stopColor="#c9801a" />
              </linearGradient>
            </defs>
            <LogoSvg fill="url(#gold)" />
            <LogoSvg fill="url(#shine)" shineRef={shineRef} />
          </svg>
        </div>

        <div className="absolute left-0 right-0 flex flex-col items-center" style={{ top: "69%" }}>
          <div
            ref={wordRef}
            className="font-light uppercase whitespace-nowrap"
            style={{
              opacity: 0,
              fontSize: "6.2vh",
              letterSpacing: "0.95em",
              fontFamily: "'Helvetica Neue', 'Inter', Arial, sans-serif",
              background: "linear-gradient(180deg,#fff3c4 0%,#ffd466 45%,#d9922a 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              textShadow: "0 0 30px rgba(255,170,40,0.25)",
            }}
          >
            {BRAND.name}
          </div>
          <div
            ref={ruleRef}
            className="mt-[2.2vh] h-px origin-center"
            style={{
              width: "26vh",
              transform: "scaleX(0)",
              background: "linear-gradient(90deg, transparent, #ffcf6b, transparent)",
            }}
          />
          <div
            ref={tagRef}
            className="mt-[2vh] whitespace-pre"
            style={{
              opacity: 0,
              fontSize: "1.8vh",
              letterSpacing: "0.5em",
              color: "#f3cd84",
              fontFamily: "'Helvetica Neue', 'Inter', Arial, sans-serif",
              fontWeight: 300,
            }}
          >
            {BRAND.tagline}
          </div>
        </div>
      </div>

      {/* controls */}
      <div className="absolute z-30 right-5 top-4 flex gap-3 text-[11px] tracking-[0.25em] uppercase">
        {!ended && (
          <button
            onClick={() => sceneRef.current?.seek(TL.LOGO_IN - 0.4)}
            className="px-3 py-1.5 rounded-full border border-amber-200/20 text-amber-100/50 hover:text-amber-100 hover:border-amber-200/60 hover:bg-amber-200/5 transition backdrop-blur-sm cursor-pointer"
          >
            Skip
          </button>
        )}
        {ended && (
          <button
            onClick={() => {
              sceneRef.current?.restart();
            }}
            className="px-4 py-2 rounded-full border border-amber-200/40 text-amber-100/90 hover:border-amber-200 hover:bg-amber-200/10 transition backdrop-blur-sm cursor-pointer"
          >
            ↺ Replay
          </button>
        )}
      </div>

      {error && (
        <div className="absolute inset-0 z-40 flex items-center justify-center text-amber-200/80 text-sm tracking-widest">
          {error}
        </div>
      )}
    </div>
  );
}
