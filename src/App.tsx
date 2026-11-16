import { useCallback, useEffect, useRef, useState } from "react";
import { IntroScene } from "./intro/IntroScene";
import { BRAND, pickQuality, TL, VIDEO_CLIPS } from "./intro/config";
import { clamp, smoothstep } from "./intro/math";

type Phase = "loading" | "ready" | "ended" | "error";

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const fmt = (t: number) => {
  const s = Math.max(0, t);
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
};

/** beats of the timeline, drawn as ticks on the scrubber */
const CHAPTERS: { t: number; label: string }[] = [
  { t: 0, label: "corridor" },
  { t: TL.RISE_START, label: "rise" },
  { t: TL.GATE_PASS, label: "gate" },
  { t: TL.ORBIT_START, label: "orbit" },
  { t: TL.CHARGE_START, label: "charge" },
  { t: TL.BLAST, label: "blast" },
  { t: TL.SOLID, label: "logo" },
];

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<IntroScene | null>(null);
  const wordRef = useRef<HTMLDivElement>(null);
  const ruleRef = useRef<HTMLDivElement>(null);
  const tagRef = useRef<HTMLDivElement>(null);
  const tcRef = useRef<HTMLSpanElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const shadeRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const lastWrite = useRef(0);
  const dragging = useRef(false);
  const resumeAfterDrag = useRef(true);

  const [phase, setPhase] = useState<Phase>("loading");
  const [playing, setPlaying] = useState(true);
  const [sound, setSound] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const [dropActive, setDropActive] = useState(false);
  const [loadedClips, setLoadedClips] = useState(0);
  const [driveMsg, setDriveMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const urls = useRef<string[]>([]);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    let scene: IntroScene | null = null;

    const write = (t: number) => {
      // ── scrubber
      const p = clamp(t / TL.END, 0, 1);
      if (fillRef.current) fillRef.current.style.width = `${p * 100}%`;
      if (headRef.current) headRef.current.style.left = `${p * 100}%`;
      if (timeRef.current) timeRef.current.textContent = fmt(t);

      // wordmark: letterspacing settles while it comes out of blur
      const w = smoothstep(TL.LOGO_IN, TL.LOGO_IN + 2.4, t);
      if (wordRef.current) {
        const ls = 0.92 - 0.6 * w;
        wordRef.current.style.opacity = String(w);
        wordRef.current.style.letterSpacing = `${ls}em`;
        wordRef.current.style.marginRight = `${-ls}em`;
        wordRef.current.style.filter = `blur(${(1 - w) * 9}px)`;
      }
      const tg = smoothstep(TL.TAG_IN, TL.TAG_IN + 1.4, t);
      if (ruleRef.current) {
        ruleRef.current.style.transform = `scaleX(${smoothstep(TL.LOGO_IN + 0.7, TL.TAG_IN, t)})`;
        ruleRef.current.style.opacity = String(0.8 * smoothstep(TL.LOGO_IN + 0.5, TL.TAG_IN, t));
      }
      if (tagRef.current) {
        tagRef.current.style.opacity = String(tg * 0.8);
        tagRef.current.style.transform = `translateY(${(1 - tg) * 7}px)`;
      }

      // broadcast-style timecode, 24 fps
      const tc = Math.min(t, TL.END);
      if (tcRef.current && Math.abs(tc - lastWrite.current) > 1 / 24) {
        lastWrite.current = tc;
        const f = Math.floor((tc % 1) * 24);
        const s = Math.floor(tc) % 60;
        const m = Math.floor(tc / 60) % 60;
        const pad = (n: number) => String(n).padStart(2, "0");
        tcRef.current.textContent = `${pad(m)}:${pad(s)}:${pad(f)}`;
      }

      if (hintRef.current) {
        hintRef.current.style.opacity = String(1 - smoothstep(3.4, 5.4, t));
      }
      // a soft pool of darkness behind the emblem so the gold separates from the plaza
      if (shadeRef.current) {
        shadeRef.current.style.opacity = String(0.6 * smoothstep(TL.BLAST + 1.0, TL.SOLID + 0.4, t));
      }
    };

    try {
      scene = new IntroScene(el, {
        quality: pickQuality(),
        onFrame: write,
        onEnd: () => setPhase("ended"),
      });
      sceneRef.current = scene;
      (window as unknown as { __intro?: IntroScene }).__intro = scene;
      setPhase("ready");
      if (reducedMotion()) {
        scene.seek(TL.END);
        scene.playing = false;
        setPlaying(false);
        setPhase("ended");
        write(TL.END);
      }
    } catch (e) {
      console.error(e);
      setPhase("error");
    }

    return () => {
      scene?.dispose();
      sceneRef.current = null;
    };
  }, []);

  const toggleSound = useCallback(async () => {
    const s = sceneRef.current;
    if (!s) return;
    const on = await s.setSound(!sound);
    setSound(on);
  }, [sound]);

  const togglePlay = useCallback(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.playing = !s.playing;
    setPlaying(s.playing);
    setShowHint(false);
  }, []);

  const skip = useCallback(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.seek(TL.LOGO_IN - 1.2);
    s.playing = true;
    setPlaying(true);
    setPhase("ready");
    setShowHint(false);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }, []);

  const replay = useCallback(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.restart();
    setPhase("ready");
    setPlaying(true);
    setShowHint(false);
  }, []);

  /** Wire a batch of local files onto the crystals — no upload, object URLs only. */
  const loadClips = useCallback((files: File[]) => {
    const s = sceneRef.current;
    if (!s) return;
    const clips = files.filter((f) => f.type.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(f.name));
    if (!clips.length) return;

    // match by the names in VIDEO_CLIPS when possible, otherwise go in order
    const byName = (f: File) => VIDEO_CLIPS.findIndex((c) => c.file.toLowerCase() === f.name.toLowerCase());
    const named = clips.filter((f) => byName(f) >= 0);
    const rest = clips.filter((f) => byName(f) < 0);
    const used = new Set<number>();

    const assign = (f: File, index: number) => {
      if (index < 0 || index >= s.crystalCount || used.has(index)) return false;
      used.add(index);
      const url = URL.createObjectURL(f);
      urls.current.push(url);
      s.setVideo(index, url);
      return true;
    };

    named.forEach((f) => assign(f, byName(f)));
    let next = 0;
    rest.forEach((f) => {
      while (next < s.crystalCount && used.has(next)) next++;
      assign(f, next);
    });
    setLoadedClips(urls.current.length);
    setShowHint(false);
  }, []);

  /**
   * Try to pull the ten clips straight out of the Drive folder, in the browser.
   * A plain `fetch` preflight tells us whether Drive hands out CORS headers; when
   * it does, the bytes come back as a blob and the plate gets a same-origin URL,
   * so the WebGL texture is never tainted. When it does not, nothing breaks —
   * the slates stay and we say so.
   */
  const loadFromDrive = useCallback(async () => {
    const s = sceneRef.current;
    if (!s) return;
    let ok = 0;
    let reason = "";
    for (let i = 0; i < VIDEO_CLIPS.length && !reason; i++) {
      setDriveMsg(`Drive ${i + 1}/${VIDEO_CLIPS.length}…`);
      const id = VIDEO_CLIPS[i].driveId;
      const url = `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;
      try {
        const res = await fetch(url, { mode: "cors", credentials: "omit" });
        const type = res.headers.get("content-type") ?? "";
        if (!res.ok) {
          reason = `Drive ответил ${res.status}`;
          break;
        }
        if (!type.startsWith("video/")) {
          reason = "файл не отдаётся публично (пришла HTML-страница)";
          break;
        }
        const blob = await res.blob();
        if (blob.size < 1024) {
          reason = "пустой ответ";
          break;
        }
        s.setVideo(i, URL.createObjectURL(blob));
        ok++;
      } catch {
        reason = "Drive не отдаёт CORS-заголовки — браузер блокирует чтение";
      }
    }
    setLoadedClips((n) => Math.max(n, ok));
    setDriveMsg(reason ? `${reason}. Перетащи файлы вручную.` : `Drive: ${ok}/${VIDEO_CLIPS.length}`);
    if (ok) setShowHint(false);
  }, []);

  useEffect(() => {
    const over = (e: DragEvent) => {
      if (!e.dataTransfer) return;
      e.preventDefault();
      setDropActive(true);
    };
    const leave = (e: DragEvent) => {
      if (!e.relatedTarget) setDropActive(false);
    };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      setDropActive(false);
      loadClips(Array.from(e.dataTransfer?.files ?? []));
    };
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [loadClips]);

  const seekFromClientX = useCallback((clientX: number) => {
    const s = sceneRef.current;
    const el = trackRef.current;
    if (!s || !el) return;
    const r = el.getBoundingClientRect();
    const k = clamp((clientX - r.left) / Math.max(1, r.width), 0, 1);
    const t = k * TL.END;
    s.seek(t);
    setPhase(t >= TL.END ? "ended" : "ready");
  }, []);

  const onScrubDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const s = sceneRef.current;
      if (!s) return;
      e.preventDefault();
      dragging.current = true;
      resumeAfterDrag.current = s.playing;
      s.playing = false;
      setPlaying(false);
      setShowHint(false);
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      seekFromClientX(e.clientX);
    },
    [seekFromClientX]
  );

  const onScrubMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return;
      seekFromClientX(e.clientX);
    },
    [seekFromClientX]
  );

  const onScrubUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    const s = sceneRef.current;
    if (!s) return;
    try {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
    if (resumeAfterDrag.current) {
      s.playing = true;
      setPlaying(true);
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = sceneRef.current;
      const k = e.key;
      if (k === " ") {
        e.preventDefault();
        if (phase === "ended") replay();
        else togglePlay();
      } else if (k === "Escape") {
        e.preventDefault();
        skip();
      } else if (k === "ArrowLeft" && s) {
        e.preventDefault();
        s.seek(Math.max(0, s.t - (e.shiftKey ? 5 : 1.5)));
        setPhase(s.t >= TL.END ? "ended" : "ready");
      } else if (k === "ArrowRight" && s) {
        e.preventDefault();
        s.seek(Math.min(TL.END, s.t + (e.shiftKey ? 5 : 1.5)));
        setPhase(s.t >= TL.END ? "ended" : "ready");
      } else if (k === "Home" && s) {
        e.preventDefault();
        s.seek(0);
        setPhase("ready");
      } else if (k === "End" && s) {
        e.preventDefault();
        s.seek(TL.END);
        setPhase("ended");
      } else if (k.toLowerCase() === "r") {
        replay();
      } else if (k.toLowerCase() === "m") {
        void toggleSound();
      } else if (k.toLowerCase() === "p") {
        togglePlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, replay, skip, toggleSound, togglePlay]);

  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-black">
      {/*
        16:9 stage that COVERS the viewport: the picture itself always renders at
        exactly 1920×1080 (16:9) — never letterboxed. On a window that is not
        16:9 the overflow edge is cropped, not padded with black bars.
      */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ width: "max(100vw, calc(100vh * 16 / 9))", height: "max(100vh, calc(100vw * 9 / 16))" }}
      >
        <div ref={mountRef} className="absolute inset-0" />
      </div>

      {/* drop zone: drag ten clips in and every crystal takes one */}
      <div
        className="pointer-events-none absolute inset-0 z-40 transition-opacity duration-200"
        style={{ opacity: dropActive ? 1 : 0 }}
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 backdrop-blur-sm">
          <div className="border border-amber-200/40 px-10 py-8 text-center">
            <p className="text-[11px] uppercase tracking-[0.4em] text-amber-200/90">отпусти ролики</p>
            <p className="mt-2 text-[10px] tracking-[0.22em] text-amber-100/45">
              10 файлов → 10 кристаллов, по одному на грань
            </p>
          </div>
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          loadClips(Array.from(e.target.files ?? []));
          e.currentTarget.value = "";
        }}
      />

      {/* brand overlay */}
      <div className="pointer-events-none absolute inset-0 z-20">
        <div
          ref={shadeRef}
          className="absolute inset-0"
          style={{
            opacity: 0,
            background:
              "radial-gradient(ellipse 52% 46% at 50% 40%, rgba(3,1,0,0.62) 0%, rgba(3,1,0,0.34) 54%, rgba(3,1,0,0) 100%)",
          }}
        />
        <div className="absolute inset-x-0 flex flex-col items-center" style={{ top: "69.5%" }}>
          <div
            ref={wordRef}
            className="whitespace-nowrap font-extralight uppercase"
            style={{
              opacity: 0,
              fontSize: "clamp(20px, 4.9vh, 58px)",
              letterSpacing: "0.92em",
              fontFamily: "'Helvetica Neue', 'Inter', 'Segoe UI', Arial, sans-serif",
              background: "linear-gradient(180deg,#fff6d2 0%,#ffd777 42%,#d9912a 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              textShadow: "0 0 34px rgba(255,170,40,0.22)",
              willChange: "letter-spacing, opacity, filter",
            }}
          >
            {BRAND.name}
          </div>
          <div
            ref={ruleRef}
            className="origin-center"
            style={{
              marginTop: "2vh",
              width: "min(26vh, 46vw)",
              height: "1px",
              transform: "scaleX(0)",
              opacity: 0,
              background: "linear-gradient(90deg, transparent, #ffcf6b, transparent)",
            }}
          />
          <div
            ref={tagRef}
            className="whitespace-pre"
            style={{
              marginTop: "1.6vh",
              opacity: 0,
              fontSize: "clamp(8px, 1.55vh, 15px)",
              letterSpacing: "0.5em",
              color: "#f4cf88",
              fontFamily: "'Helvetica Neue', 'Inter', Arial, sans-serif",
              fontWeight: 300,
            }}
          >
            {BRAND.tagline}
          </div>
        </div>
      </div>

      {/* slate / HUD */}
      <div className="pointer-events-none absolute left-5 top-4 z-30 flex items-baseline gap-3 text-[10px] font-light uppercase tracking-[0.32em] text-amber-100/35">
        <span className="text-amber-100/60">{BRAND.name}</span>
        <span className="h-px w-6 bg-amber-200/25" />
        <span>{BRAND.reel}</span>
      </div>
      <div className="pointer-events-none absolute right-5 top-11 z-30 hidden font-mono text-[10px] tracking-[0.28em] text-amber-100/25 sm:block">
        TC <span ref={tcRef}>00:00:00</span>
      </div>

      {/* controls */}
      <div className="absolute right-5 top-4 z-40 flex items-center gap-2 text-[10px] uppercase tracking-[0.28em]">
        <button
          onClick={toggleSound}
          className="cursor-pointer rounded-full border border-amber-200/15 px-3 py-1.5 text-amber-100/45 backdrop-blur-sm transition hover:border-amber-200/50 hover:bg-amber-200/5 hover:text-amber-100"
          aria-pressed={sound}
        >
          {sound ? "Sound on" : "Sound off"}
        </button>
        <button
          onClick={togglePlay}
          className="cursor-pointer rounded-full border border-amber-200/15 px-3 py-1.5 text-amber-100/45 backdrop-blur-sm transition hover:border-amber-200/50 hover:bg-amber-200/5 hover:text-amber-100"
          aria-pressed={!playing}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button
          onClick={() => void loadFromDrive()}
          className="cursor-pointer rounded-full border border-amber-200/15 px-3 py-1.5 text-amber-100/45 backdrop-blur-sm transition hover:border-amber-200/50 hover:bg-amber-200/5 hover:text-amber-100"
          title="Подтянуть десять роликов прямо из папки Drive circle/video"
        >
          ⤓ Drive
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          className="cursor-pointer rounded-full border border-amber-200/15 px-3 py-1.5 text-amber-100/45 backdrop-blur-sm transition hover:border-amber-200/50 hover:bg-amber-200/5 hover:text-amber-100"
          title="Подставить свои ролики: 10 файлов — по одному на кристалл"
        >
          {loadedClips ? `Clips ${loadedClips}/${VIDEO_CLIPS.length}` : "Clips"}
        </button>
        <button
          onClick={toggleFullscreen}
          className="cursor-pointer rounded-full border border-amber-200/15 px-3 py-1.5 text-amber-100/45 backdrop-blur-sm transition hover:border-amber-200/50 hover:bg-amber-200/5 hover:text-amber-100"
          aria-label="Fullscreen"
        >
          ⛶
        </button>
        {phase === "ended" ? (
          <button
            onClick={replay}
            className="cursor-pointer rounded-full border border-amber-200/45 px-4 py-1.5 text-amber-100/90 backdrop-blur-sm transition hover:border-amber-200 hover:bg-amber-200/10"
          >
            ↺ Replay
          </button>
        ) : (
          <button
            onClick={skip}
            className="cursor-pointer rounded-full border border-amber-200/25 px-3 py-1.5 text-amber-100/60 backdrop-blur-sm transition hover:border-amber-200/60 hover:bg-amber-200/5 hover:text-amber-100"
          >
            Skip
          </button>
        )}
      </div>

      {/* ── timeline scrubber */}
      <div
        className="absolute inset-x-0 bottom-0 z-40 select-none"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.62), rgba(0,0,0,0.22) 55%, transparent)" }}
      >
        <div className="flex items-center gap-3 px-5 pb-4 pt-8">
          <span ref={timeRef} className="w-14 shrink-0 font-mono text-[10px] tracking-[0.18em] text-amber-100/70">
            0:00.0
          </span>
          <div
            ref={trackRef}
            role="slider"
            aria-label="Timeline"
            aria-valuemin={0}
            aria-valuemax={TL.END}
            tabIndex={0}
            onPointerDown={onScrubDown}
            onPointerMove={onScrubMove}
            onPointerUp={onScrubUp}
            onPointerCancel={onScrubUp}
            className="group relative h-7 flex-1 cursor-pointer touch-none outline-none"
          >
            {/* rail */}
            <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-white/10" />
            {/* played */}
            <div
              ref={fillRef}
              className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full"
              style={{
                width: "0%",
                background: "linear-gradient(90deg, rgba(255,170,50,0.35), #ffcf6b)",
                boxShadow: "0 0 12px rgba(255,190,80,0.55)",
              }}
            />
            {/* chapter ticks */}
            {CHAPTERS.map((c) => (
              <span
                key={c.label}
                title={c.label}
                className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-amber-100/25"
                style={{ left: `${(c.t / TL.END) * 100}%` }}
              />
            ))}
            {/* handle */}
            <div
              ref={headRef}
              className="pointer-events-none absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-amber-100/80 bg-amber-200 transition-[transform] group-hover:scale-125"
              style={{ left: "0%", boxShadow: "0 0 14px rgba(255,200,110,0.8)" }}
            />
          </div>
          <span className="w-14 shrink-0 text-right font-mono text-[10px] tracking-[0.18em] text-amber-100/40">
            {fmt(TL.END)}
          </span>
        </div>
      </div>

      {driveMsg && (
        <div className="pointer-events-none absolute bottom-24 left-5 z-40 max-w-md font-mono text-[10px] leading-relaxed tracking-[0.14em] text-amber-100/55">
          {driveMsg}
        </div>
      )}

      <div
        ref={hintRef}
        className="pointer-events-none absolute inset-x-0 z-30 text-center text-[9px] uppercase tracking-[0.4em] text-amber-100/25"
        style={{ bottom: "56px", transition: "opacity 0.6s" }}
        hidden={!showHint}
      >
        drag the timeline · space — play · ← → — seek · m — sound · r — replay
      </div>

      {phase === "error" && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black text-center">
          <p className="text-xs uppercase tracking-[0.4em] text-amber-200/70">WebGL недоступен</p>
          <p className="max-w-xs text-[11px] leading-relaxed tracking-wider text-amber-100/35">
            Интро требует аппаратного ускорения браузера. Включите WebGL / Hardware acceleration и обновите страницу.
          </p>
        </div>
      )}
    </div>
  );
}
