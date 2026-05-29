// Per-page configuration injected at build/dev time (see vite.config.js).
const APP_CONFIG = (typeof window !== "undefined" && window.__APP_CONFIG__) || {};

const DEFAULT_ACCENT_COLOR = "#c8a04e";

/** UI accent color for the current event (falls back to the default gold). */
export const ACCENT_COLOR = (APP_CONFIG.event && APP_CONFIG.event.accentColor) || DEFAULT_ACCENT_COLOR;
