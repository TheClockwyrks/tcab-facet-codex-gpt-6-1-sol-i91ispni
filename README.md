# Facet

Facet is a browser puzzle about cut stones and accumulated pressure. Swap neighboring gems into lines of three or more. Clears strain the stones beside them; a fully flawed stone shatters with a neighboring clear and scores double. Longer matches earn brilliants, stars, and prisms. Cascades climb an eight-step scoring ladder. Reach each level's target to continue; the round ends when no legal swap remains.

## Run

Use Node.js 22.12 or newer.

```sh
npm ci
npm run dev
```

Open the address printed by Vite. No server, account, network service, or credential is needed to play.

```sh
npm run build
npm run preview
```

The complete static site is in `dist/`. Serve that directory at an origin root or a sub-path; the bundle and all asset references are relative to the page. The production build only bundles committed assets. It never invokes an asset-generation binary.

## Controls

Use a mouse, pen, or finger. Press a stone to select it, drag onto an orthogonal neighbor, and release to request the swap. You can also tap a stone, then press and release its neighbor. While held, the offer shows the two stones exchanged. Drag back to the selected stone to cancel the offer. Press empty space to clear the selection.

Menus also accept **↑ / ↓** to choose and **Enter / Space** to confirm. **P / Escape** pauses or resumes; **Escape** returns from the guide or round-end screen. **M** toggles all sound. Every screen has pointer controls, including Pause and Back. The engine's **backtick** key opens the diagnostic overlay.

## Checks

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

Tests cover the rules, cut priority, wave propagation, scoring, gravity, refill poses, time integration, pointer transactions, menus, and the real engine running over a Node canvas with the actual raster files. Coverage reports are written to `coverage/`.

The implementation is split between the immutable simulation and debug poses in `src/simulation.ts`, asset loading and canvas presentation in `src/presentation.ts`, and the game's exported contract in `src/game.ts`. The supplied engine owns input, timing, audio, viewport fitting, diagnostics, and recording. The debug surface is available through `engine.debug`, with poses applied through `engine.apply`.

## Original assets and showcase

`public/assets/` contains all original pixel sprites, fracture frames, prism-turn frames, four authored live particle systems, nine event sounds with eight ascending chain tones, and two original sequenced music pieces with MIDI scores. The stone silhouettes and facet patterns distinguish all seven kinds; damage is baked into four separate sprites for each stone. Clear audio layers a sampled glass body with the synthesized chain tone through the engine bus.

`scripts/produce-assets.py` records the one-time production recipe using `draw`, `draw-sheet`, `particle-2d`, `sfx-synth`, `sfx-sample`, and `music`. It is documentation and an optional regeneration tool for a machine that has those binaries, not an installation or build step. PNG, JSON, WAV, and MIDI deliverables are already committed.

`showcase/` contains the player description, screenshots, and a gzipped capture of a three-step chain made with the engine recorder. To recapture it while the development server is running, use `node scripts/capture-showcase.mjs`. This automation creates its own engine; the normal game publishes no global debug handle.
