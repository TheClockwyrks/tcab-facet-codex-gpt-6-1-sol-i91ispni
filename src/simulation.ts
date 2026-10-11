import type { DeepReadonly } from "ts-essentials";
import type { UpdateApi } from "@clockwyrks/simple-2d";
import type {
  FacetState,
  GemState,
  GemKind,
  Cut,
  BoardState,
  CellRef,
  Screen,
  PointerDevice,
} from "./game";
import * as C from "./constants";

export type State = DeepReadonly<FacetState>;
export const cellX = (col: number): number =>
  C.BOARD_CX - ((C.GRID_COLS - 1) * C.CELL_PITCH) / 2 + col * C.CELL_PITCH;
export const cellY = (row: number): number =>
  C.BOARD_CY - ((C.GRID_ROWS - 1) * C.CELL_PITCH) / 2 + row * C.CELL_PITCH;
const index = (c: CellRef): number => c.row * C.GRID_COLS + c.col;
const ref = (i: number): CellRef => ({
  col: i % C.GRID_COLS,
  row: Math.floor(i / C.GRID_COLS),
});
const same = (a: CellRef | null, b: CellRef | null): boolean =>
  !!a && !!b && a.col === b.col && a.row === b.row;
const adjacent = (a: CellRef, b: CellRef): boolean =>
  Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1;
const emptyBoard = (): BoardState => ({ cols: 0, rows: 0, cells: [] });
const emptyRefill = (): string[] =>
  Array.from({ length: C.GRID_COLS }, () => "");
export function initialState(muted = false): FacetState {
  return {
    screen: "title",
    menuIndex: 0,
    board: emptyBoard(),
    phase: "idle",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
    score: 0,
    level: 1,
    levelScore: 0,
    lastCleared: 0,
    lastPoints: 0,
    lastWaves: 0,
    moveScore: 0,
    bestMove: 0,
    bestChain: 0,
    selection: null,
    offer: null,
    refusal: null,
    armedTarget: null,
    pointer: { x: 0, y: 0, down: false, device: "mouse" },
    simTime: 0,
    muted,
    refillKinds: emptyRefill(),
  };
}
function number(value: number, min?: number): number {
  if (
    !Number.isFinite(value) ||
    (min !== undefined && (!Number.isInteger(value) || value < min))
  )
    throw new Error("Facet: invalid number");
  return value;
}
function cell(col: number, row: number): CellRef {
  number(col, 0);
  number(row, 0);
  if (col >= C.GRID_COLS || row >= C.GRID_ROWS)
    throw new Error("Facet: cell outside board");
  return { col, row };
}
const letters = "RACJBSM";
function token(text: string, c: CellRef): GemState {
  const match = /^([RACJBSMX])([0-3])([bs]?)$/.exec(text);
  if (!match || (match[1] === "X" && match[3]))
    throw new Error(`Facet: invalid token ${text}`);
  return {
    ...c,
    kind: match[1] === "X" ? null : C.GEM_KINDS[letters.indexOf(match[1])],
    cut:
      match[1] === "X"
        ? "prism"
        : match[3] === "b"
          ? "brilliant"
          : match[3] === "s"
            ? "star"
            : "plain",
    strain: Number(match[2]),
    fell: 0,
  };
}
export interface Run {
  readonly cells: readonly number[];
  readonly kind: GemKind;
  readonly horizontal: boolean;
}
export function runs(board: DeepReadonly<BoardState>): Run[] {
  const found: Run[] = [];
  for (const horizontal of [true, false])
    for (let line = 0; line < C.GRID_ROWS; line++) {
      let start = 0;
      while (start < C.GRID_COLS) {
        const at = (n: number): number =>
          horizontal ? line * C.GRID_COLS + n : n * C.GRID_COLS + line;
        const kind = board.cells[at(start)]?.kind;
        let end = start + 1;
        while (end < C.GRID_COLS && kind && board.cells[at(end)]?.kind === kind)
          end++;
        if (kind && end - start >= C.MATCH_MIN)
          found.push({
            cells: Array.from({ length: end - start }, (_, n) => at(start + n)),
            kind,
            horizontal,
          });
        start = end;
      }
    }
  return found;
}
function exchanged(
  board: DeepReadonly<BoardState>,
  a: CellRef,
  b: CellRef,
): BoardState {
  const ai = index(a),
    bi = index(b);
  return {
    ...board,
    cells: board.cells.map((gem, i) =>
      i === ai
        ? { ...board.cells[bi], ...a, fell: 0 }
        : i === bi
          ? { ...board.cells[ai], ...b, fell: 0 }
          : { ...gem },
    ),
  };
}
function productive(
  board: DeepReadonly<BoardState>,
  a: CellRef,
  b: CellRef,
): boolean {
  return (
    !!board.cells[index(a)] &&
    !!board.cells[index(b)] &&
    (board.cells[index(a)].cut === "prism" ||
      board.cells[index(b)].cut === "prism" ||
      runs(exchanged(board, a, b)).length > 0)
  );
}
export function legalSwap(board: DeepReadonly<BoardState>): boolean {
  for (const gem of board.cells)
    for (const b of [
      { col: gem.col + 1, row: gem.row },
      { col: gem.col, row: gem.row + 1 },
    ])
      if (
        b.col < C.GRID_COLS &&
        b.row < C.GRID_ROWS &&
        productive(board, gem, b)
      )
        return true;
  return false;
}
const randomKind = (): GemKind =>
  C.GEM_KINDS[Math.floor(Math.random() * C.GEM_KIND_COUNT)];
export function deal(): BoardState {
  for (;;) {
    const cells: GemState[] = [];
    for (let i = 0; i < C.GRID_COLS * C.GRID_ROWS; i++) {
      const c = ref(i);
      let kind: GemKind;
      do {
        kind = randomKind();
      } while (
        (c.col >= 2 &&
          cells[i - 1].kind === kind &&
          cells[i - 2].kind === kind) ||
        (c.row >= 2 &&
          cells[i - C.GRID_COLS].kind === kind &&
          cells[i - 2 * C.GRID_COLS].kind === kind)
      );
      cells.push({ ...c, kind, cut: "plain", strain: 0, fell: c.row + 1 });
    }
    const board = { cols: C.GRID_COLS, rows: C.GRID_ROWS, cells };
    if (legalSwap(board)) return board;
  }
}
export interface Target {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
export function targets(screen: Screen): Target[] {
  if (screen === "playing")
    return [{ id: "pause", x: 1056, y: 32, w: 144, h: C.TARGET_MIN_H }];
  if (screen === "howto")
    return [{ id: "back", x: 1072, y: 608, w: 144, h: C.TARGET_MIN_H }];
  return [0, 1].map((i) => ({
    id: `menu-${i}`,
    x: 480,
    y: screen === "title" ? 390 + i * 92 : 420 + i * 92,
    w: 320,
    h: C.TARGET_MIN_H,
  }));
}
export function lastFall(s: State): number {
  return Math.max(0, ...s.board.cells.map((g) => g.fell));
}
export function stepHold(s: State): number {
  return (
    s.lastWaves * C.WAVE_SECONDS +
    lastFall(s) * C.FALL_SECONDS_PER_ROW +
    C.STEP_SECONDS
  );
}

// These records are presentation products of a transition, never inputs to board rules.
// They live in the state so rendering cannot move the simulation or keep hidden game data.
export interface StepVisual {
  readonly before: BoardState;
  readonly cleared: readonly {
    readonly gem: GemState;
    readonly wave: number;
  }[];
  readonly created: readonly CellRef[];
}
export interface MotionState extends FacetState {
  readonly swap?: {
    readonly a: CellRef;
    readonly b: CellRef;
    readonly prismKind: GemKind | null | "all" | "none";
  };
  readonly visual?: StepVisual;
  readonly dealAt?: number;
}
type MotionRead = DeepReadonly<MotionState>;
type Emit = (cue: C.CueName, rung?: number) => void;
const silent: Emit = () => {};
export function requestSwap(
  s: State,
  a: CellRef,
  b: CellRef,
  emit: Emit = silent,
): MotionState {
  if (s.phase !== "idle" || !adjacent(a, b) || !productive(s.board, a, b)) {
    emit(C.CUES.refuse);
    return { ...s, refusal: { a, b, timer: 0 } };
  }
  const ga = s.board.cells[index(a)],
    gb = s.board.cells[index(b)];
  const prismKind =
    ga.cut === "prism" && gb.cut === "prism"
      ? "all"
      : ga.cut === "prism"
        ? gb.kind
        : gb.cut === "prism"
          ? ga.kind
          : "none";
  emit(C.CUES.swap);
  return {
    ...s,
    board: exchanged(s.board, a, b),
    phase: "swapping",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
    moveScore: 0,
    refusal: null,
    swap: { a, b, prismKind },
    visual: undefined,
  };
}
function neighbors(i: number, diagonal = false): number[] {
  const c = ref(i);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++)
      if (
        (dx || dy) &&
        (diagonal || Math.abs(dx) + Math.abs(dy) === 1) &&
        c.col + dx >= 0 &&
        c.col + dx < C.GRID_COLS &&
        c.row + dy >= 0 &&
        c.row + dy < C.GRID_ROWS
      )
        out.push((c.row + dy) * C.GRID_COLS + c.col + dx);
  return out;
}
export function resolveStep(
  s: MotionRead,
  emit: Emit = silent,
): MotionState | null {
  const matching = runs(s.board);
  const prism = s.chainStep === 1 ? s.swap?.prismKind : "none";
  const seeds =
    prism && prism !== "none"
      ? s.board.cells.flatMap((g, i) =>
          prism === "all" ||
          g.kind === prism ||
          (g.cut === "prism" &&
            (same(g, s.swap?.a ?? null) || same(g, s.swap?.b ?? null)))
            ? [i]
            : [],
        )
      : matching.flatMap((r) => [...r.cells]);
  if (!seeds.length) return null;
  const waves = new Map<number, number>();
  const queue: number[] = [];
  for (const i of seeds)
    if (!waves.has(i)) {
      waves.set(i, 0);
      queue.push(i);
    }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q],
      g = s.board.cells[i],
      w = waves.get(i)!;
    const additions = neighbors(i).filter(
      (n) => s.board.cells[n].strain === C.MAX_STRAIN,
    );
    if (g.cut === "brilliant") additions.push(...neighbors(i, true));
    if (g.cut === "star")
      for (let n = 0; n < C.GRID_COLS; n++)
        additions.push(g.row * C.GRID_COLS + n, n * C.GRID_COLS + g.col);
    for (const n of additions)
      if (!waves.has(n)) {
        waves.set(n, w + 1);
        queue.push(n);
      }
  }
  const created = new Map<number, { kind: GemKind | null; cut: Cut }>();
  const priority: Record<Cut, number> = {
    plain: 0,
    brilliant: 1,
    star: 2,
    prism: 3,
  };
  const create = (i: number, kind: GemKind, cut: Cut): void => {
    if (priority[cut] > priority[created.get(i)?.cut ?? "plain"])
      created.set(i, { kind: cut === "prism" ? null : kind, cut });
  };
  if (!prism || prism === "none") {
    for (const run of matching) {
      if (run.cells.length >= 4) {
        const swapped = run.cells.filter(
          (i) =>
            same(ref(i), s.swap?.a ?? null) || same(ref(i), s.swap?.b ?? null),
        );
        create(
          swapped[0] ?? run.cells[Math.floor((run.cells.length - 1) / 2)],
          run.kind,
          run.cells.length >= 5 ? "prism" : "brilliant",
        );
      }
      for (const other of matching)
        if (run.horizontal !== other.horizontal)
          for (const i of run.cells)
            if (other.cells.includes(i)) create(i, run.kind, "star");
    }
  }
  let points = 0;
  const multiplier = Math.min(s.chainStep, C.MAX_MULTIPLIER);
  for (const i of waves.keys())
    points +=
      (s.board.cells[i].strain === C.MAX_STRAIN
        ? C.FLAWED_SCORE
        : C.BASE_SCORE) * multiplier;
  let flawed = false;
  const survivors: (GemState | null)[] = s.board.cells.map((g, i) => {
    if (waves.has(i))
      return created.has(i)
        ? { ...g, ...created.get(i)!, strain: 0, fell: 0 }
        : null;
    const strain = neighbors(i).some((n) => waves.has(n))
      ? Math.min(C.MAX_STRAIN, g.strain + 1)
      : g.strain;
    if (strain === C.MAX_STRAIN && g.strain < C.MAX_STRAIN) flawed = true;
    return { ...g, strain, fell: 0 };
  });
  const cells: GemState[] = Array.from({ length: C.GRID_COLS * C.GRID_ROWS });
  for (let col = 0; col < C.GRID_COLS; col++) {
    const live = survivors.filter(
      (g): g is GemState => g !== null && g.col === col,
    );
    const gaps = C.GRID_ROWS - live.length;
    for (let row = 0; row < C.GRID_ROWS; row++) {
      const old = live[row - gaps];
      if (old)
        cells[row * C.GRID_COLS + col] = { ...old, row, fell: row - old.row };
      else {
        const letter = s.refillKinds[col]?.[row];
        cells[row * C.GRID_COLS + col] = {
          col,
          row,
          kind: letter ? C.GEM_KINDS[letters.indexOf(letter)] : randomKind(),
          cut: "plain",
          strain: 0,
          fell: gaps,
        };
      }
    }
  }
  emit(C.CUES.clear, multiplier);
  if (flawed) emit(C.CUES.flaw);
  if (created.size) emit(C.CUES.cut);
  return {
    ...s,
    board: { ...s.board, cells },
    score: s.score + points,
    levelScore: s.levelScore + points,
    moveScore: s.moveScore + points,
    lastCleared: waves.size,
    lastPoints: points,
    lastWaves: Math.max(...waves.values()),
    bestChain: Math.max(s.bestChain, s.chainStep),
    stepTimer: 0,
    visual: {
      before: { ...s.board, cells: s.board.cells.map((g) => ({ ...g })) },
      cleared: [...waves].map(([i, wave]) => ({
        gem: { ...s.board.cells[i] },
        wave,
      })),
      created: [...created.keys()].map(ref),
    },
  };
}
function enter(s: State, screen: Screen): FacetState {
  return { ...s, screen, menuIndex: 0, armedTarget: null };
}
function fresh(s: State): MotionState {
  return {
    ...initialState(s.muted),
    simTime: s.simTime,
    pointer: s.pointer,
    screen: "playing",
    board: deal(),
    dealAt: s.simTime,
  };
}
function quit(s: State): FacetState {
  return {
    ...s,
    screen: "title",
    menuIndex: 0,
    board: emptyBoard(),
    phase: "idle",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
    selection: null,
    offer: null,
    refusal: null,
    armedTarget: null,
  };
}
function confirm(s: State): FacetState {
  if (s.screen === "title")
    return s.menuIndex === 0 ? fresh(s) : enter(s, "howto");
  if (s.screen === "paused")
    return s.menuIndex === 0 ? enter(s, "playing") : quit(s);
  if (s.screen === "gameover") return s.menuIndex === 0 ? fresh(s) : quit(s);
  if (s.screen === "levelclear")
    return s.menuIndex === 0
      ? ({
          ...s,
          screen: "playing",
          menuIndex: 0,
          level: s.level + 1,
          levelScore: 0,
          bestMove: 0,
          bestChain: 0,
          board: deal(),
          selection: null,
          offer: null,
          refusal: null,
          armedTarget: null,
          dealAt: s.simTime,
          visual: undefined,
          swap: undefined,
        } as MotionState)
      : quit(s);
  return { ...s };
}
function back(s: State): FacetState {
  if (s.screen === "howto")
    return { ...s, screen: "title", menuIndex: 1, armedTarget: null };
  if (s.screen === "gameover") return enter(s, "title");
  return { ...s };
}
function pause(s: State): FacetState {
  return s.screen === "playing"
    ? enter(s, "paused")
    : s.screen === "paused"
      ? enter(s, "playing")
      : { ...s };
}
function hitCell(s: State, x: number, y: number): CellRef | null {
  let best: CellRef | null = null;
  let d = C.GEM_HIT_R * C.GEM_HIT_R;
  for (const g of s.board.cells) {
    const dist = (cellX(g.col) - x) ** 2 + (cellY(g.row) - y) ** 2;
    if (dist <= d && (!best || dist < d)) {
      best = { col: g.col, row: g.row };
      d = dist;
    }
  }
  return best;
}
export function pointer(
  s: State,
  type: "down" | "move" | "up",
  x: number,
  y: number,
  device: PointerDevice,
  emit: Emit = silent,
): FacetState {
  if (!["mouse", "pen", "touch"].includes(device))
    throw new Error("Facet: invalid pointer device");
  number(x);
  number(y);
  let next: FacetState = {
    ...s,
    pointer: {
      x,
      y,
      device,
      down: type === "down" ? true : type === "up" ? false : s.pointer.down,
    },
  };
  const target = targets(s.screen).find(
    (t) => x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h,
  );
  if (target?.id.startsWith("menu-") && (type !== "move" || !s.pointer.down))
    next = { ...next, menuIndex: Number(target.id.slice(5)) };
  if (type === "down") {
    next = { ...next, armedTarget: target?.id ?? null };
    if (s.screen === "playing" && !target) {
      const c = hitCell(s, x, y);
      if (c && s.selection && adjacent(c, s.selection))
        next = { ...next, offer: c };
      else {
        next = { ...next, selection: c, offer: null };
        if (c && !same(c, s.selection)) emit(C.CUES.select);
      }
    }
  } else if (
    type === "move" &&
    s.screen === "playing" &&
    s.pointer.down &&
    s.selection &&
    !s.armedTarget
  ) {
    const c = hitCell(s, x, y);
    if (same(c, s.selection)) next = { ...next, offer: null };
    else if (c && adjacent(c, s.selection)) next = { ...next, offer: c };
  } else if (type === "up") {
    if (s.armedTarget && target?.id === s.armedTarget)
      next =
        target.id === "pause"
          ? pause(next)
          : target.id === "back"
            ? back(next)
            : confirm(next);
    else if (!s.armedTarget && s.screen === "playing" && s.selection && s.offer)
      next = {
        ...requestSwap(next, s.selection, s.offer, emit),
        selection: null,
        offer: null,
      };
    next = { ...next, armedTarget: null };
  }
  return next;
}
export function advance(s: State, dt: number, emit: Emit = silent): FacetState {
  let next: MotionState = { ...s };
  if (next.screen !== "playing") return next;
  if (next.refusal)
    next = {
      ...next,
      refusal:
        next.refusal.timer + dt >= C.REFUSAL_SECONDS
          ? null
          : { ...next.refusal, timer: next.refusal.timer + dt },
    };
  let remaining = dt;
  while (remaining > 0 && next.screen === "playing" && next.phase !== "idle") {
    if (next.phase === "swapping") {
      const spend = Math.min(remaining, C.SWAP_SECONDS - next.swapTimer);
      remaining -= spend;
      next = { ...next, swapTimer: next.swapTimer + spend };
      if (next.swapTimer + 1e-10 >= C.SWAP_SECONDS) {
        next = {
          ...next,
          phase: "resolving",
          chainStep: 1,
          swapTimer: 0,
          stepTimer: 0,
        };
        next = resolveStep(next, emit) ?? {
          ...next,
          phase: "idle",
          chainStep: 0,
        };
      }
    } else {
      const landAt =
        next.lastWaves * C.WAVE_SECONDS +
        lastFall(next) * C.FALL_SECONDS_PER_ROW;
      const spend = Math.min(remaining, stepHold(next) - next.stepTimer);
      remaining -= spend;
      if (
        next.stepTimer < landAt &&
        next.stepTimer + spend + 1e-10 >= landAt &&
        lastFall(next) > C.LAND_MIN_ROWS
      )
        emit(C.CUES.land);
      next = { ...next, stepTimer: next.stepTimer + spend };
      if (next.stepTimer + 1e-10 >= stepHold(next)) {
        const resolved = resolveStep(
          { ...next, chainStep: next.chainStep + 1, stepTimer: 0 },
          emit,
        );
        if (resolved) next = resolved;
        else {
          next = {
            ...next,
            phase: "idle",
            chainStep: 0,
            stepTimer: 0,
            bestMove: Math.max(next.bestMove, next.moveScore),
            visual: undefined,
            swap: undefined,
          };
          if (next.levelScore >= C.LEVEL_TARGET_STEP * next.level) {
            next = {
              ...next,
              screen: "levelclear",
              menuIndex: 0,
              armedTarget: null,
            };
            emit(C.CUES.levelUp);
          } else if (!legalSwap(next.board)) {
            next = {
              ...next,
              screen: "gameover",
              menuIndex: 0,
              armedTarget: null,
            };
            emit(C.CUES.gameOver);
          }
        }
      }
    }
  }
  return next;
}
export function update(s: State, api: UpdateApi, dt: number): FacetState {
  const cues = new Set<C.CueName>();
  let rung = 1;
  const emit: Emit = (cue, tone) => {
    cues.add(cue);
    if (tone) rung = tone;
  };
  let next: MotionState = { ...s, simTime: s.simTime + dt };
  const pressed = Object.fromEntries(
    C.ACTIONS.map((a) => [a, api.input.pressed(a)]),
  );
  if (pressed.mute) api.audio.setMuted(!api.audio.muted());
  if (pressed.up || pressed.down)
    if (!["playing", "howto"].includes(next.screen))
      next = {
        ...next,
        menuIndex: (next.menuIndex + (pressed.down ? 1 : -1) + 2) % 2,
      };
  if (pressed.confirm) next = confirm(next);
  if (pressed.pause) next = pause(next);
  if (pressed.back) next = back(next);
  const samples = api.input.pointerSamples().filter((p) => p.primary);
  for (const p of samples)
    if (p.button === null || p.button === "primary")
      next = pointer(next, p.type, p.x, p.y, p.device, emit);
  api.input.pointerPressed();
  api.input.pointerReleased();
  const { x, y, down, device } = api.input.pointer();
  next = { ...next, pointer: { x, y, down, device }, muted: api.audio.muted() };
  if (next.screen !== "playing" && next.dealAt !== undefined)
    next = { ...next, dealAt: next.dealAt + dt };
  next = advance(next, dt, emit);
  for (const cue of cues) {
    api.audio.play(cue);
    if (cue === C.CUES.clear) api.audio.play(`chain-tone-${rung}`);
  }
  const theme = ["title", "howto"].includes(next.screen)
    ? "title-theme"
    : "play-bed";
  api.audio.stop(theme === "title-theme" ? "play-bed" : "title-theme");
  api.audio.loop(theme);
  return next;
}
function snapshot(s: State) {
  return {
    version: C.FACET_DEBUG_VERSION,
    screen: s.screen,
    menuIndex: s.menuIndex,
    score: s.score,
    level: s.level,
    levelScore: s.levelScore,
    levelTarget: C.LEVEL_TARGET_STEP * s.level,
    phase: s.phase,
    chainStep: s.chainStep,
    multiplier: Math.min(s.chainStep, C.MAX_MULTIPLIER),
    swapTimer: s.swapTimer,
    stepTimer: s.stepTimer,
    stepHold: stepHold(s),
    board: {
      ...s.board,
      cells: s.board.cells.map((g) => ({
        ...g,
        x: cellX(g.col),
        y: cellY(g.row),
      })),
    },
    selection: s.selection ? { ...s.selection } : null,
    offer: s.offer ? { ...s.offer } : null,
    refusal: s.refusal
      ? { a: { ...s.refusal.a }, b: { ...s.refusal.b } }
      : null,
    lastCleared: s.lastCleared,
    lastPoints: s.lastPoints,
    lastWaves: s.lastWaves,
    lastFall: lastFall(s),
    moveScore: s.moveScore,
    bestMove: s.bestMove,
    bestChain: s.bestChain,
    legalSwap: legalSwap(s.board),
    refillKinds: [...s.refillKinds],
    pointer: { ...s.pointer },
    armedTarget: s.armedTarget,
    targets: targets(s.screen),
    muted: s.muted,
    simTime: s.simTime,
  };
}
export const debug = {
  version: C.FACET_DEBUG_VERSION,
  reset: (s: State): FacetState => initialState(s.muted),
  reconcile: (s: State): FacetState => ({ ...s }),
  snapshot,
  setScreen: (s: State, screen: Screen): FacetState => {
    if (
      ![
        "title",
        "howto",
        "playing",
        "paused",
        "levelclear",
        "gameover",
      ].includes(screen)
    )
      throw new Error("Facet: invalid screen");
    return { ...s, screen };
  },
  setMenuIndex: (s: State, menuIndex: number): FacetState => ({
    ...s,
    menuIndex: number(menuIndex, 0),
  }),
  loadBoard: (s: State, rows: readonly string[]): FacetState => {
    if (rows.length !== C.GRID_ROWS) throw new Error("Facet: wrong row count");
    const cells = rows.flatMap((line, row) => {
      const tokens = line.trim().split(/\s+/);
      if (tokens.length !== C.GRID_COLS)
        throw new Error("Facet: wrong column count");
      return tokens.map((t, col) => token(t, { col, row }));
    });
    return { ...s, board: { cols: C.GRID_COLS, rows: C.GRID_ROWS, cells } };
  },
  dealBoard: (s: State): FacetState =>
    ({ ...s, board: deal(), dealAt: s.simTime }) as MotionState,
  clearBoard: (s: State): FacetState => ({ ...s, board: emptyBoard() }),
  setGem: (s: State, col: number, row: number, text: string): FacetState => {
    const c = cell(col, row);
    if (!s.board.cells[index(c)]) throw new Error("Facet: no board");
    const gem = token(text, c);
    return {
      ...s,
      board: {
        ...s.board,
        cells: s.board.cells.map((g, i) => (i === index(c) ? gem : { ...g })),
      },
    };
  },
  setRefillKinds: (s: State, col: number, kinds: string): FacetState => {
    cell(col, 0);
    if (!/^[RACJBSM]*$/.test(kinds)) throw new Error("Facet: invalid refill");
    return {
      ...s,
      refillKinds: s.refillKinds.map((v, i) => (i === col ? kinds : v)),
    };
  },
  clearRefillKinds: (s: State): FacetState => ({
    ...s,
    refillKinds: emptyRefill(),
  }),
  setScore: (s: State, score: number): FacetState => ({
    ...s,
    score: number(score),
  }),
  setLevel: (s: State, level: number): FacetState => ({
    ...s,
    level: number(level, 1),
  }),
  setLevelScore: (s: State, levelScore: number): FacetState => ({
    ...s,
    levelScore: number(levelScore),
  }),
  setBestChain: (s: State, bestChain: number): FacetState => ({
    ...s,
    bestChain: number(bestChain, 0),
  }),
  setBestMove: (s: State, bestMove: number): FacetState => ({
    ...s,
    bestMove: number(bestMove),
  }),
  setMoveScore: (s: State, moveScore: number): FacetState => ({
    ...s,
    moveScore: number(moveScore),
  }),
  setSelection: (s: State, col: number, row: number): FacetState => ({
    ...s,
    selection: cell(col, row),
  }),
  clearSelection: (s: State): FacetState => ({ ...s, selection: null }),
  setOffer: (s: State, col: number, row: number): FacetState => ({
    ...s,
    offer: cell(col, row),
  }),
  clearOffer: (s: State): FacetState => ({ ...s, offer: null }),
  clearRefusal: (s: State): FacetState => ({ ...s, refusal: null }),
  clearChain: (s: State): FacetState => ({
    ...s,
    phase: "idle",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
  }),
  requestSwap: (
    s: State,
    colA: number,
    rowA: number,
    colB: number,
    rowB: number,
  ): FacetState => {
    const a = cell(colA, rowA),
      b = cell(colB, rowB);
    if (!s.board.cells[index(a)] || !s.board.cells[index(b)])
      throw new Error("Facet: no board");
    return requestSwap(s, a, b);
  },
  pointerDown: (
    s: State,
    x: number,
    y: number,
    device: PointerDevice = "mouse",
  ): FacetState => pointer(s, "down", x, y, device),
  pointerMove: (
    s: State,
    x: number,
    y: number,
    device: PointerDevice = "mouse",
  ): FacetState => pointer(s, "move", x, y, device),
  pointerUp: (s: State, device: PointerDevice = "mouse"): FacetState =>
    pointer(s, "up", s.pointer.x, s.pointer.y, device),
};
export type FacetDebugApi = typeof debug;
