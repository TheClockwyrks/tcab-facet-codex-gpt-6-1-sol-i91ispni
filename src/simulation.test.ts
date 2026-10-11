/// <reference types="node" />
import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { createEngine, ConstantClock } from "@clockwyrks/simple-2d";
import { game, type FacetState } from "./game";
import {
  debug,
  initialState,
  advance,
  resolveStep,
  deal,
  runs,
  legalSwap,
  cellX,
  cellY,
  type MotionState,
  targets,
} from "./simulation";
import * as C from "./constants";
const letters = "RACJBSM";
const rows = (): string[] =>
  Array.from({ length: C.GRID_ROWS }, (_, r) =>
    Array.from(
      { length: C.GRID_COLS },
      (_, c) => letters[(r * 2 + c) % 7] + "0",
    ).join(" "),
  );
function posed(changes: readonly [number, number, string][]): FacetState {
  let s = debug.setScreen(debug.loadBoard(initialState(), rows()), "playing");
  for (const [col, row, t] of changes) s = debug.setGem(s, col, row, t);
  return s;
}
function resolved(
  changes: readonly [number, number, string][],
  extra: Partial<MotionState> = {},
): MotionState {
  const s = {
    ...posed(changes),
    phase: "resolving" as const,
    chainStep: 1,
    ...extra,
  };
  const result = resolveStep(s);
  expect(result).not.toBeNull();
  return result!;
}
function noRandom(s: FacetState): FacetState {
  for (let col = 0; col < C.GRID_COLS; col++)
    s = debug.setRefillKinds(
      s,
      col,
      Array.from(
        { length: C.GRID_ROWS },
        (_, r) => letters[(r * 2 + col) % 7],
      ).join(""),
    );
  return s;
}
describe("board rules", () => {
  it("deals opening boards without runs and with a legal move", () => {
    for (let n = 0; n < 30; n++) {
      const b = deal();
      expect(b.cells).toHaveLength(64);
      expect(runs(b)).toEqual([]);
      expect(legalSwap(b)).toBe(true);
      for (const g of b.cells) {
        expect(g.strain).toBe(0);
        expect(g.cut).toBe("plain");
        expect(g.fell).toBeGreaterThanOrEqual(g.row + 1);
      }
    }
  });
  it("reports every maximal run and keeps a prism out", () => {
    const s = posed([
      [0, 0, "R0"],
      [1, 0, "R1b"],
      [2, 0, "R2s"],
      [3, 0, "R3"],
      [4, 0, "X0"],
      [5, 0, "R0"],
    ]);
    expect(runs(s.board)).toEqual([
      { cells: [0, 1, 2, 3], kind: "ruby", horizontal: true },
    ]);
  });
  it("refuses nonadjacent, unproductive and busy swaps without touching the board", () => {
    const s = posed([]);
    for (const [a, b] of [
      [0, 2],
      [0, 1],
    ]) {
      const next = debug.requestSwap(s, a, 0, b, 0);
      expect(next.board).toEqual(s.board);
      expect(next.refusal?.timer).toBe(0);
      expect(next.phase).toBe("idle");
    }
    const busy = { ...s, phase: "resolving" as const };
    expect(debug.requestSwap(busy, 0, 0, 1, 0).board).toEqual(s.board);
  });
  it("exchanges accepted gems immediately and resets both journeys", () => {
    const s = posed([
      [0, 0, "R0"],
      [1, 0, "A0"],
      [2, 0, "R0"],
      [1, 1, "R2"],
    ]);
    const next = debug.requestSwap(s, 1, 0, 1, 1);
    expect(next.phase).toBe("swapping");
    expect(next.chainStep).toBe(0);
    expect(next.board.cells[1].kind).toBe("ruby");
    expect(next.board.cells[1].strain).toBe(2);
    expect(next.board.cells[9].kind).toBe("amber");
    expect(next.swapTimer).toBe(0);
    expect(next.board.cells[1].fell).toBe(0);
  });
  it("scores flawed gems twice, strains neighbors once, and preserves input", () => {
    const source = posed([
      [0, 0, "R0"],
      [1, 0, "R3"],
      [2, 0, "R0"],
      [0, 1, "A2"],
      [1, 1, "C1"],
    ]);
    const before = JSON.stringify(source);
    const next = resolveStep({ ...source, phase: "resolving", chainStep: 3 })!;
    expect(next.lastCleared).toBe(3);
    expect(next.lastPoints).toBe(120);
    expect(next.score).toBe(120);
    expect(next.bestChain).toBe(3);
    expect(next.board.cells[8].strain).toBe(3);
    expect(next.board.cells[9].strain).toBe(2);
    expect(JSON.stringify(source)).toBe(before);
  });
  it("expands flaws breadth first with the minimum wave and closes over cuts", () => {
    const n = resolved([
      [0, 0, "R0"],
      [1, 0, "R0"],
      [2, 0, "R0"],
      [3, 0, "J3"],
      [4, 0, "B3"],
      [4, 1, "S3b"],
      [5, 1, "M0s"],
    ]);
    const waves = n.visual!.cleared;
    expect(waves.find((c) => c.gem.col === 3 && c.gem.row === 0)?.wave).toBe(1);
    expect(waves.find((c) => c.gem.col === 4 && c.gem.row === 0)?.wave).toBe(2);
    expect(waves.find((c) => c.gem.col === 4 && c.gem.row === 1)?.wave).toBe(3);
    expect(waves.find((c) => c.gem.col === 5 && c.gem.row === 1)?.wave).toBe(4);
    expect(waves.some((c) => c.gem.col === 5 && c.gem.row === 7)).toBe(true);
    expect(n.lastWaves).toBeGreaterThanOrEqual(5);
  });
  it("creates a brilliant at the swapped cell of lower run index", () => {
    const n = resolved(
      [
        [0, 3, "R0"],
        [1, 3, "R0"],
        [2, 3, "R0"],
        [3, 3, "R0"],
      ],
      {
        swap: {
          a: { col: 2, row: 3 },
          b: { col: 3, row: 3 },
          prismKind: "none",
        },
      },
    );
    expect(n.visual!.created).toEqual([{ col: 2, row: 3 }]);
    const gem = n.board.cells.find((g) => g.cut === "brilliant")!;
    expect(gem.col).toBe(2);
    expect(gem.strain).toBe(0);
  });
  it("creates stars at intersections and gives a prism priority", () => {
    const crossing: [[number, number, string], ...[number, number, string][]] =
      [
        [1, 3, "R0"],
        [2, 3, "R0"],
        [3, 3, "R0"],
        [2, 2, "R0"],
        [2, 4, "R0"],
      ];
    expect(resolved(crossing).board.cells.some((g) => g.cut === "star")).toBe(
      true,
    );
    const n = resolved([...crossing, [0, 3, "R0"], [4, 3, "R0"]]);
    expect(n.board.cells.filter((g) => g.cut === "prism")).toHaveLength(1);
    expect(n.board.cells.find((g) => g.cut === "prism")?.kind).toBeNull();
  });
  it("seeds a prism swap with its partner kind, including kind-carrying cuts", () => {
    let s = posed([
      [0, 0, "X0"],
      [1, 0, "R0"],
      [4, 4, "R2b"],
    ]);
    s = noRandom(s);
    const expected = s.board.cells.filter((g) => g.kind === "ruby").length + 1;
    const exchanged = debug.requestSwap(s, 0, 0, 1, 0);
    const n = advance(exchanged, C.SWAP_SECONDS) as MotionState;
    expect(n.visual!.cleared.filter((g) => g.wave === 0)).toHaveLength(
      expected,
    );
    expect(n.visual!.created).toEqual([]);
    expect(n.lastCleared).toBeGreaterThanOrEqual(expected);
  });
  it("a prism pair clears the entire board without creating cuts", () => {
    const s = noRandom(
      posed([
        [0, 0, "X0"],
        [1, 0, "X3"],
      ]),
    );
    const n = advance(
      debug.requestSwap(s, 0, 0, 1, 0),
      C.SWAP_SECONDS,
    ) as MotionState;
    expect(n.lastCleared).toBe(64);
    expect(n.lastPoints).toBe(650);
    expect(n.lastWaves).toBe(0);
    expect(n.visual!.created).toEqual([]);
    expect(
      n.board.cells.every(
        (g) => g.fell === 8 && g.cut === "plain" && g.strain === 0,
      ),
    ).toBe(true);
  });
  it("settles survivors in order and refills from the per-row posed kinds", () => {
    let s = noRandom(
      posed([
        [0, 4, "R0"],
        [1, 4, "R0"],
        [2, 4, "R0"],
        [0, 2, "B2b"],
      ]),
    );
    s = debug.setRefillKinds(s, 0, "M");
    const n = resolveStep({ ...s, phase: "resolving", chainStep: 1 })!;
    expect(n.board.cells[0].kind).toBe("amethyst");
    expect(n.board.cells[0].fell).toBe(1);
    expect(n.board.cells[24].cut).toBe("brilliant");
    expect(n.board.cells[24].strain).toBe(2);
    expect(n.board.cells[24].fell).toBe(1);
  });
  it("carries excess time across swap and step boundaries independently of frame division", () => {
    const start = debug.requestSwap(
      noRandom(
        posed([
          [0, 0, "R0"],
          [1, 0, "A0"],
          [2, 0, "R0"],
          [1, 1, "R0"],
        ]),
      ),
      1,
      0,
      1,
      1,
    );
    const whole = advance(start, 1.3);
    let split = start;
    for (let i = 0; i < 130; i++) split = advance(split, 0.01);
    const a = debug.snapshot(whole),
      b = debug.snapshot(split);
    expect(a.board).toEqual(b.board);
    expect(a.score).toBe(b.score);
    expect(a.phase).toBe(b.phase);
    expect(a.stepTimer).toBeCloseTo(b.stepTimer, 8);
    expect(a.bestMove).toBe(b.bestMove);
  });
  it("freezes timers and refusal on every nonplaying screen", () => {
    const source = debug.requestSwap(posed([[0, 0, "X0"]]), 0, 0, 1, 0);
    for (const screen of [
      "title",
      "howto",
      "paused",
      "levelclear",
      "gameover",
    ] as const) {
      const s = debug.setScreen(
        {
          ...source,
          refusal: { a: { col: 0, row: 0 }, b: { col: 1, row: 0 }, timer: 0.1 },
        },
        screen,
      );
      expect(advance(s, 10)).toEqual(s);
    }
  });
  it("keeps fell after landing, ages refusal, and evaluates level before round end", () => {
    let s = debug.requestSwap(
      noRandom(
        posed([
          [0, 0, "X0"],
          [1, 0, "X0"],
        ]),
      ),
      0,
      0,
      1,
      0,
    );
    s = debug.setLevelScore(s, C.LEVEL_TARGET_STEP);
    const next = advance(s, 2);
    expect(next.screen).toBe("levelclear");
    expect(next.bestMove).toBe(640);
    expect(next.bestChain).toBe(1);
    expect(next.board.cells[63].fell).toBe(8);
    const refusal = debug.requestSwap(posed([]), 0, 0, 1, 0);
    expect(advance(refusal, C.REFUSAL_SECONDS).refusal).toBeNull();
  });
  it("caps the multiplier", () => {
    expect(
      resolved(
        [
          [0, 0, "R0"],
          [1, 0, "R0"],
          [2, 0, "R0"],
        ],
        { chainStep: 20 },
      ).lastPoints,
    ).toBe(3 * C.BASE_SCORE * C.MAX_MULTIPLIER);
  });
});
describe("debug poses and pointer", () => {
  it("poses one value at a time and reconciles without advancing", () => {
    let s = posed([]);
    s = debug.setScore(s, 123);
    s = debug.setLevel(s, 4);
    s = debug.setLevelScore(s, 91);
    s = debug.setBestMove(s, 80);
    s = debug.setBestChain(s, 3);
    s = debug.setMoveScore(s, 70);
    s = debug.setMenuIndex(s, 42);
    s = debug.setSelection(s, 7, 7);
    s = debug.setOffer(s, 6, 7);
    s = debug.setRefillKinds(s, 2, "RAC");
    const before = JSON.stringify(s);
    expect(debug.reconcile(s)).toEqual(s);
    expect(debug.reconcile(debug.reconcile(s))).toEqual(s);
    const snap = debug.snapshot(s);
    expect(snap.levelTarget).toBe(8000);
    expect(snap.legalSwap).toBe(false);
    expect(snap.board.cells[0].x).toBe(cellX(0));
    expect(snap.board.cells[0].y).toBe(cellY(0));
    expect(snap.bestMove).toBe(80);
    expect(snap.bestChain).toBe(3);
    expect(snap.moveScore).toBe(70);
    expect(JSON.stringify(s)).toBe(before);
    s = debug.clearSelection(s);
    expect(s.offer).not.toBeNull();
    s = debug.clearOffer(s);
    s = debug.clearRefillKinds(s);
    s = debug.clearRefusal(s);
    s = debug.clearChain(s);
    expect(s.phase).toBe("idle");
    s = debug.clearBoard(s);
    expect(s.board.cells).toEqual([]);
    expect(s.score).toBe(123);
    expect(debug.reset({ ...s, muted: true })).toEqual(initialState(true));
  });
  it("fails loudly for out-of-domain poses", () => {
    const s = posed([]);
    const invalid = [
      () => debug.setGem(s, 8, 0, "R0"),
      () => debug.setGem(s, 0, 0, "X0b"),
      () => debug.setGem(s, 0, 0, "R4"),
      () => debug.setRefillKinds(s, 0, "RX"),
      () => debug.setLevel(s, 0),
      () => debug.setMenuIndex(s, -1),
      () => debug.setBestChain(s, 1.2),
      () => debug.setScore(s, NaN),
      () => debug.loadBoard(s, ["R0"]),
      () => debug.loadBoard(s, Array(8).fill("R0")),
      () => debug.setSelection(s, -1, 0),
      () => debug.pointerDown(s, Infinity, 0),
      () => debug.setGem(initialState(), 0, 0, "R0"),
      () => debug.requestSwap(initialState(), 0, 0, 1, 0),
    ];
    for (const f of invalid) expect(f).toThrow();
  });
  it("takes a dragged offer only on release and withdraws it on return", () => {
    let s = posed([
      [0, 0, "R0"],
      [1, 0, "A0"],
      [2, 0, "R0"],
      [1, 1, "R0"],
    ]);
    s = debug.pointerDown(s, cellX(1), cellY(1), "touch");
    s = debug.pointerMove(s, cellX(1), cellY(0), "touch");
    expect(s.offer).toEqual({ col: 1, row: 0 });
    expect(s.phase).toBe("idle");
    s = debug.pointerMove(s, cellX(1), cellY(1), "touch");
    expect(s.offer).toBeNull();
    s = debug.pointerUp(s, "touch");
    expect(s.selection).toEqual({ col: 1, row: 1 });
    s = debug.pointerDown(s, cellX(1), cellY(0), "pen");
    s = debug.pointerUp(s, "pen");
    expect(s.phase).toBe("swapping");
    expect(s.selection).toBeNull();
    expect(s.offer).toBeNull();
    expect(s.pointer.device).toBe("pen");
  });
  it("handles retargeting, a miss, gap motion and midpoint tie-breaking", () => {
    let s = posed([]);
    s = debug.pointerDown(s, cellX(0) + C.GEM_HIT_R, cellY(0));
    expect(s.selection).toEqual({ col: 0, row: 0 });
    s = debug.pointerMove(s, cellX(7), cellY(7));
    expect(s.selection).toEqual({ col: 0, row: 0 });
    expect(s.offer).toBeNull();
    s = debug.pointerUp(s);
    s = debug.pointerDown(s, cellX(7), cellY(7));
    expect(s.selection).toEqual({ col: 7, row: 7 });
    s = debug.pointerDown(s, 20, 20);
    expect(s.selection).toBeNull();
  });
  it("arms targets and accepts only a release in the same rectangle", () => {
    let s = initialState();
    const t = targets("title")[1];
    s = debug.pointerMove(s, t.x + 10, t.y + 10);
    expect(s.menuIndex).toBe(1);
    s = debug.pointerDown(s, t.x + 10, t.y + 10, "touch");
    expect(s.armedTarget).toBe("menu-1");
    s = debug.pointerMove(s, 10, 10, "touch");
    s = debug.pointerUp(s, "touch");
    expect(s.screen).toBe("title");
    expect(s.armedTarget).toBeNull();
    s = debug.pointerDown(s, t.x + 10, t.y + 10);
    s = debug.pointerUp(s);
    expect(s.screen).toBe("howto");
    const b = targets("howto")[0];
    s = debug.pointerDown(s, b.x + 10, b.y + 10);
    s = debug.pointerUp(s);
    expect(s.screen).toBe("title");
    expect(s.menuIndex).toBe(1);
  });
  it("puts down an abandoned round and continues a finished level", () => {
    let s = debug.setScreen(posed([]), "paused");
    s = debug.setScore(s, 120);
    const t = targets("paused")[1];
    s = debug.pointerDown(s, t.x + 10, t.y + 10);
    s = debug.pointerUp(s);
    expect(s.screen).toBe("title");
    expect(s.board.cols).toBe(0);
    expect(s.score).toBe(120);
    s = debug.setScreen(posed([]), "levelclear");
    const c = targets("levelclear")[0];
    s = debug.pointerDown(s, c.x + 10, c.y + 10);
    s = debug.pointerUp(s);
    expect(s.level).toBe(2);
    expect(s.levelScore).toBe(0);
    expect(s.screen).toBe("playing");
    expect(runs(s.board)).toEqual([]);
  });
  it("reports usable separate targets on all screens", () => {
    for (const screen of [
      "title",
      "howto",
      "playing",
      "paused",
      "levelclear",
      "gameover",
    ] as const) {
      const ts = targets(screen);
      for (const t of ts) {
        expect(t.w).toBeGreaterThanOrEqual(C.TARGET_MIN_W);
        expect(t.h).toBeGreaterThanOrEqual(C.TARGET_MIN_H);
        expect(t.x).toBeGreaterThanOrEqual(0);
        expect(t.y + t.h).toBeLessThanOrEqual(C.STAGE_H);
      }
      if (ts.length === 2)
        expect(ts[0].y + ts[0].h).toBeLessThanOrEqual(ts[1].y);
    }
  });
});

// The real engine and real raster assets run in Node; only the browser codecs
// are adapted to this host. AudioBus still owns every event and mute transition.
describe("engine integration", () => {
  beforeAll(() => {
    vi.stubGlobal(
      "fetch",
      async (url: string) =>
        new Response(
          await readFile(new URL(`../public/${url}`, import.meta.url)),
        ),
    );
    vi.stubGlobal("createImageBitmap", async (blob: Blob) =>
      loadImage(Buffer.from(await blob.arrayBuffer())),
    );
    vi.stubGlobal(
      "AudioContext",
      class {
        async decodeAudioData(bytes: ArrayBuffer) {
          const data = new DataView(bytes);
          expect(data.getUint32(0, false)).toBe(0x52494646);
          return { duration: bytes.byteLength / 88200, numberOfChannels: 2 };
        }
        async resume() {}
      },
    );
  });
  afterAll(() => vi.unstubAllGlobals());
  async function setup() {
    const events = new EventTarget();
    const canvas = createCanvas(
      C.STAGE_W,
      C.STAGE_H,
    ) as unknown as HTMLCanvasElement;
    const engine = createEngine({
      canvas,
      width: C.STAGE_W,
      height: C.STAGE_H,
      background: "#0b171f",
      game,
      clock: new ConstantClock(10),
      surface: {
        cssWidth: () => C.STAGE_W,
        cssHeight: () => C.STAGE_H,
        dpr: () => 1,
        events: () => events,
      },
    });
    await engine.initialize();
    return { engine, events };
  }
  function key(events: EventTarget, code: string): void {
    for (const type of ["keydown", "keyup"]) {
      const e = new Event(type);
      Object.assign(e, { code, repeat: false });
      events.dispatchEvent(e);
    }
  }
  it("loads all art before exposing debug, reads diagnostics, and draws every screen", async () => {
    const { engine } = await setup();
    expect(engine.debug.version).toBe(C.FACET_DEBUG_VERSION);
    expect(engine.debug.snapshot(engine.state).board.cells).toEqual([]);
    expect(engine.diagnostics().length).toBeGreaterThanOrEqual(19);
    for (const screen of [
      "title",
      "howto",
      "playing",
      "paused",
      "levelclear",
      "gameover",
    ] as const) {
      engine.apply((s) =>
        engine.debug.setScreen(engine.debug.dealBoard(s), screen),
      );
      await engine.advance(1);
      expect(engine.state.screen).toBe(screen);
    }
    engine.destroy();
  });
  it("drives menus, mute and paused time with engine actions", async () => {
    const { engine, events } = await setup();
    key(events, "ArrowUp");
    await engine.advance(1);
    expect(engine.state.menuIndex).toBe(1);
    key(events, "Enter");
    await engine.advance(1);
    expect(engine.state.screen).toBe("howto");
    key(events, "Escape");
    await engine.advance(1);
    expect(engine.state.screen).toBe("title");
    expect(engine.state.menuIndex).toBe(1);
    key(events, "ArrowDown");
    await engine.advance(1);
    key(events, "Space");
    await engine.advance(1);
    expect(engine.state.screen).toBe("playing");
    expect(engine.state.score).toBe(0);
    key(events, "KeyM");
    await engine.advance(1);
    expect(engine.state.muted).toBe(true);
    key(events, "KeyP");
    await engine.advance(1);
    expect(engine.state.screen).toBe("paused");
    const before = engine.state;
    await engine.advance(40);
    expect(engine.state.board).toEqual(before.board);
    expect(engine.state.simTime).toBeCloseTo(before.simTime + 0.4);
    key(events, "Escape");
    await engine.advance(1);
    expect(engine.state.screen).toBe("playing");
    engine.destroy();
  });
  it("resolves a real posed chain with one cue of each event per frame", async () => {
    const { engine } = await setup();
    const played: { cue: string; t: number }[] = [];
    engine.events.on("cue:played", (e) => played.push(e));
    engine.apply(() =>
      noRandom(
        posed([
          [0, 0, "R0"],
          [1, 0, "A0"],
          [2, 0, "R0"],
          [1, 1, "R0"],
          [3, 0, "J3"],
          [3, 1, "B3"],
        ]),
      ),
    );
    engine.apply((s) => engine.debug.requestSwap(s, 1, 0, 1, 1));
    expect(played).toEqual([]);
    await engine.advance(18);
    expect(engine.state.lastCleared).toBe(5);
    expect(engine.state.score).toBe(70);
    expect(engine.state.lastWaves).toBe(2);
    await engine.advance(90);
    expect(engine.state.phase).toBe("idle");
    expect(played.some((e) => e.cue === C.CUES.clear)).toBe(true);
    const identities = played.map((e) => `${e.t}:${e.cue}`);
    expect(new Set(identities).size).toBe(identities.length);
    engine.destroy();
  });
});
