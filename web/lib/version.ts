/**
 * App version + release channel — single source of truth for the UI badges
 * (header + footer). The alpha production launch ships as v0.1.0; keep
 * APP_VERSION in sync with web/package.json's "version" field.
 */
export const APP_VERSION = "0.1.0";
export const APP_CHANNEL = "alpha";

/** e.g. "v0.1.0" */
export const APP_VERSION_LABEL = `v${APP_VERSION}`;
