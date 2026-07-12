/**
 * App version + release channel — the single source of truth for every version
 * string the UI shows (header badge, footer, page title). Bump APP_VERSION here
 * for each iteration (alpha runs as v0.1.x) and keep web/package.json's "version"
 * field in sync; nothing else needs editing.
 */
export const APP_VERSION = "0.1.5";
export const APP_CHANNEL = "alpha";

/** e.g. "v0.1.5" */
export const APP_VERSION_LABEL = `v${APP_VERSION}`;

/** e.g. "alpha v0.1.5" — channel + version, used wherever both are shown together. */
export const APP_RELEASE = `${APP_CHANNEL} ${APP_VERSION_LABEL}`;
