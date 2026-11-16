// ─────────────────────────────────────────────────────────────
//  Easy-to-edit settings for the intro
// ─────────────────────────────────────────────────────────────

export const BRAND = {
  name: "CIRCINUS",
  tagline: "PRECISION  ·  CRAFT  ·  LIGHT",
};

/**
 * Ссылки на видео для 10 монолитов (mp4/webm, лучше с CORS).
 * Пока null — показывается анимированный плейсхолдер.
 * Пример: VIDEO_SOURCES[0] = "/videos/reel-01.mp4"
 */
export const VIDEO_SOURCES: (string | null)[] = Array.from({ length: 10 }, () => null);

export const CORE_Y = 11; // height of the energy core above the plaza
export const MONO_COUNT = 10;

// Timeline (seconds)
export const TL = {
  WAVE_START: 2.0,
  WAVE_LEN: 14.0,
  CHARGE_START: 19.0,
  COLLAPSE: 31.0,
  BLAST: 32.0,
  FORM_START: 33.2,
  FORM_END: 36.0,
  LOGO_IN: 35.1,
  END: 41.0,
};
