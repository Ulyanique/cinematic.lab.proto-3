// ─────────────────────────────────────────────────────────────
//  CIRCINUS — single source of truth for the intro
//  Everything an art director would want to tweak lives here.
// ─────────────────────────────────────────────────────────────

export const BRAND = {
  name: "CIRCINUS",
  tagline: "PRECISION  ·  CRAFT  ·  LIGHT",
  reel: "REEL 01",
};

/**
 * The ten clips that live on each crystal's face.
 *
 * They are served from `public/videos/` (see `tools/fetch-videos.mjs` — it pulls
 * them straight out of the shared Drive folder). Anything that fails to load
 * falls back to a generated, animated slate, so the piece never shows a hole.
 */
export interface VideoClip {
  /** file name inside public/videos/ */
  file: string;
  /** Google Drive file id (used by tools/fetch-videos.mjs) */
  driveId: string;
  title: string;
}

/** Drive folder: circle / video */
export const VIDEO_FOLDER_ID = "1bXKZtdz1PGetHGCwTZ_ypulauQbocp_z";

export const VIDEO_CLIPS: VideoClip[] = [
  { file: "01-badges.mp4", driveId: "1UhaOdfHezqCkQse7E4jY1FfXTYlexuxB", title: "00.07 Бэйджи" },
  { file: "02-sobol-anisimov.mp4", driveId: "14d-CeBIQqTkngZa1vYFtuQVNCiE3sMHs", title: "01.25 Соболь / Анисимов" },
  { file: "03-shulgan.mp4", driveId: "1DD9S7hyWcN4Wxy_K0_NfbF-TGGxJkQGG", title: "01.25–01.28 Шульган" },
  { file: "04-tihonova.mp4", driveId: "1PYLkv3M2ill_ogxp6AbWYF9vzVQZNM_t", title: "03.34 Тихонова" },
  { file: "05-hall-wide.mp4", driveId: "1eGqWy5Sq0eWvzxUVol4lAde7Nnt4jAdZ", title: "03.36 Общий план зала" },
  { file: "06-zikeev.mp4", driveId: "1KIKyFJBHPT0kY_SCUKKD19GbUu4U6RH5", title: "03.52 Зикеев" },
  { file: "07-borovskaya.mp4", driveId: "1DgehbMwfg5adlT46SuK-lZpQ7Ox8lZtW", title: "04.51 Боровская" },
  { file: "08-yushkevichus.mp4", driveId: "1eAC1QfYoVKW2BjgIPgjSp4RMK5UxCrEo", title: "04.59 Юшкевичус" },
  { file: "09-photozone.mp4", driveId: "11GVp3tnpxAgZggckDb4V1Sg0Ec5gTRXr", title: "05.41 фотозона" },
  { file: "10-winners.mp4", driveId: "1OWdo9oqbhRclax_ZJAWsw3f4gDaSuTOC", title: "05.44 все победители" },
];

export const VIDEO_SOURCES: (string | null)[] = VIDEO_CLIPS.map((c) => `/videos/${c.file}`);

// ── world layout ─────────────────────────────────────────────
export const MONO_COUNT = 10;
export const RING_R = 36; // radius of the crystal ring
export const CORE_Y = 12; // height of the energy core above the plaza
/** Angular gap in the ring (radians) the camera flies through — the "gate". */
export const GATE_GAP = 1.0;
export const GATE_DIR = 0; // gap faces +Z (camera's entry direction)

// ── timeline (seconds) ───────────────────────────────────────
export const TL = {
  FADE_IN: 1.5,
  /** crystal ring starts rising out of the ground */
  RISE_START: 7.6,
  /** camera crosses the gate plane */
  GATE_PASS: 10.7,
  ORBIT_START: 12.4,
  ORBIT_END: 22.6,
  /** every screen goes dark, light streams into the core */
  CHARGE_START: 23.4,
  CONVERGE_END: 26.4,
  IMPLODE_START: 27.0,
  BLAST: 28.0,
  FORM_START: 28.7, // particles converge into the compass
  FORM_END: 30.7,
  SOLID: 30.35, // the golden emblem solidifies
  LOGO_IN: 30.6, // wordmark
  TAG_IN: 31.9,
  END: 34.5,
};

/** Seconds of the "money beat": detonation → solid logo. */
export const POST_BLAST = TL.END - TL.BLAST;

// ── quality knobs (?q=low|mid|high) ──────────────────────────
export interface QualitySettings {
  /** internal render height — the canvas is always exactly 16:9 */
  renderH: number;
  bloomRes: number;
  shafts: boolean;
  sampleCount: number;
  embers: number;
  sparks: number;
  shards: number;
}

export const QUALITY: Record<"low" | "mid" | "high", QualitySettings> = {
  low: { renderH: 720, bloomRes: 192, shafts: false, sampleCount: 0, embers: 900, sparks: 2200, shards: 140 },
  mid: { renderH: 900, bloomRes: 256, shafts: true, sampleCount: 2, embers: 2000, sparks: 5000, shards: 260 },
  high: { renderH: 1080, bloomRes: 384, shafts: true, sampleCount: 4, embers: 2800, sparks: 6000, shards: 320 },
};

export function pickQuality(): QualitySettings {
  if (typeof window === "undefined") return QUALITY.high;
  const q = new URLSearchParams(window.location.search).get("q");
  if (q === "low" || q === "mid" || q === "high") return QUALITY[q];
  const small = Math.min(window.innerWidth, window.innerHeight) < 620;
  const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  return mobile || small ? QUALITY.low : QUALITY.high;
}
