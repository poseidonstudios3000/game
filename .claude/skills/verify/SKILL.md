---
name: verify
description: Verify changes to the Pop Squadron game (index.html) by driving it headlessly and capturing screenshots.
---

# Verifying this repo

The game is a single self-contained file, `index.html` (canvas, no build step, no server needed — load it via `file://`).

## Handle

Headless Chromium via playwright-core, executable at `/opt/pw-browsers/chromium`:

```js
const { chromium } = require('playwright-core');
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 470, height: 800 } });
await page.goto('file:///home/user/game/index.html');
```

Install `playwright-core` with npm in a scratch dir if not present (~2s). Capture
`page.on('pageerror')` and console errors — the run fails if any fire.

## Driving the game

The page exposes `window.POP` test hooks:

- `POP.state` — 'title' | 'play' | 'over'; `POP.score`, `POP.wave`, `POP.lives`, `POP.enemies`, `POP.boss`, `POP.player`
- `POP.start()` — leave title (or press Enter)
- `POP.setPos(x, y)` — teleport the ship (logical 390x693 coords)
- `POP.chargeZap()` then press Space — fire the screen-clear
- `POP.warpToBoss()` — next wave becomes the boss wave
- `POP.hurt()` / `POP.end()` — force damage / drain to game over

Flows worth driving after a change: Enter starts wave 1; arrows move with no
drift after release; ~8s of autofire yields score > 0; charged ZAP clears orbs;
boss spawns on wave 4 and dies when hp runs out; P pauses (score frozen);
game over → Enter → title → Enter → clean restart (score 0, lives 3);
hi-score persists in localStorage key `popsquadron-hi`.

A full driver script exists from the original build session (loops all of the
above, exits non-zero on any failure or JS error) — recreate from this list if
not on disk. Screenshot at each state; the art must stay on-model with
`mockups/flat.html` (Pop Squadron board: ink outlines, flat two-tone shading,
pink/teal enemies, cream/yellow/indigo player).
