import type { InitApi, RenderApi } from "@clockwyrks/simple-2d";
import {
  ParticleSimulator,
  type ParticleSystem,
} from "@clockwyrks/particle-runtime";
import type { DeepReadonly } from "ts-essentials";
import type { FacetState, GemState } from "./game";
import type { MotionState, Target } from "./simulation";
import { cellX, cellY, targets, lastFall } from "./simulation";
import * as C from "./constants";
export const BACKGROUND = "#0b171f";
const GOLD = "#e0c48b",
  INK = "#edf3ef",
  MUTED = "#8ba5ad";
// Loaded bitmaps, definitions and decoded buffers are the only module-held data.
const images = new Map<string, ImageBitmap>();
const systems = new Map<string, ParticleSystem>();

export async function initializeAssets(
  api: InitApi<FacetState>,
): Promise<void> {
  const files = [
    "board-frame",
    "brilliant",
    "star",
    ...[...C.GEM_KINDS, "prism"].flatMap((k) =>
      [0, 1, 2, 3].map((n) => `${k}-${n}`),
    ),
    ...C.GEM_KINDS.flatMap((k) =>
      [0, 1, 2, 3, 4, 5].map((f) => `break/${k}/${f}`),
    ),
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((f) => `prism-turn/${f}`),
  ];
  const loads: Promise<unknown>[] = files.map(async (path) =>
    images.set(path, await api.assets.loadImage(`gems/${path}.png`)),
  );
  for (const fx of ["clear", "flawed", "cut", "aura"])
    loads.push(
      (async () => {
        const blob = await api.assets.load(`fx/${fx}/system.json`);
        systems.set(fx, JSON.parse(await blob.text()) as ParticleSystem);
      })(),
    );
  for (const cue of Object.values(C.CUES))
    loads.push(
      api.audio.load(
        cue,
        `audio/${cue === C.CUES.clear ? "shatter" : cue}.wav`,
      ),
    );
  loads.push(
    api.audio.load("title-theme", "audio/title.wav"),
    api.audio.load("play-bed", "audio/play.wav"),
  );
  for (let i = 1; i <= C.MAX_MULTIPLIER; i++)
    loads.push(api.audio.load(`chain-tone-${i}`, `audio/ladder-${i}.wav`));
  // All audio sources settle before debug or a frame becomes available.
  await Promise.all(loads);
}
function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size = 16,
  color = INK,
  align: CanvasTextAlign = "left",
  serif = false,
): void {
  ctx.fillStyle = color;
  ctx.font = `${serif ? "normal" : "500"} ${size}px ${serif ? 'Georgia, "Times New Roman", serif' : '"Trebuchet MS", sans-serif'}`;
  ctx.textAlign = align;
  ctx.fillText(value, x, y);
}
function rule(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  color = "#29404a",
): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, 1);
}
function sprite(
  ctx: CanvasRenderingContext2D,
  key: string,
  x: number,
  y: number,
  size = 64,
): void {
  const image = images.get(key);
  if (image) ctx.drawImage(image, x - size / 2, y - size / 2, size, size);
}
function stone(
  ctx: CanvasRenderingContext2D,
  g: DeepReadonly<GemState>,
  x: number,
  y: number,
  time: number,
  size = 64,
): void {
  ctx.save();
  ctx.shadowColor = "#000b";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 5;
  sprite(ctx, `${g.kind ?? "prism"}-${g.strain}`, x, y, size);
  ctx.restore();
  if (g.cut === "prism") {
    ctx.save();
    ctx.globalAlpha = 0.45;
    sprite(ctx, `prism-turn/${Math.floor(time * 8) % 8}`, x, y, size);
    ctx.restore();
  } else if (g.cut !== "plain") sprite(ctx, g.cut, x, y, size);
}
function effect(
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  age: number,
  seed: number,
): void {
  const system = systems.get(name);
  if (!system || age < 0 || (name !== "aura" && age > 1.1)) return;
  const sim = new ParticleSimulator(system, { seed });
  const duration = name === "aura" ? (age % 1.2) + 0.6 : age;
  for (let t = 0; t < duration; t += 1 / 60)
    sim.step(Math.min(1 / 60, duration - t) * 1000);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const p of sim.capture()) {
    ctx.globalAlpha = p.opacity;
    ctx.fillStyle = `rgb(${p.color.map((c) => Math.round(c * 255)).join(",")})`;
    const radius = Math.max(0.4, p.size * 2.2);
    ctx.beginPath();
    ctx.arc(x + p.position[0], y - p.position[1], radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
function field(ctx: CanvasRenderingContext2D): void {
  const gradient = ctx.createRadialGradient(
    C.STAGE_CX,
    340,
    70,
    C.STAGE_CX,
    360,
    760,
  );
  gradient.addColorStop(0, "#19303b");
  gradient.addColorStop(0.65, BACKGROUND);
  gradient.addColorStop(1, BACKGROUND);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  ctx.strokeStyle = "#193039";
  ctx.lineWidth = 1;
  for (const side of [0, 1])
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      const x = side ? C.STAGE_W : 0;
      ctx.moveTo(x, 100 + i * 105);
      ctx.lineTo(side ? 1010 : 270, 320 + i * 32);
      ctx.lineTo(x, 700 - i * 75);
      ctx.stroke();
    }
  text(ctx, "F /", 48, 52, 23, GOLD);
  text(ctx, "THE LAPIDARY COLLECTION", 86, 51, 11, MUTED);
  rule(ctx, 48, 673, 240);
  text(ctx, "FACET   /   PRESSURE FINDS THE FLAW", 48, 697, 10, MUTED);
  text(ctx, "M  SOUND", 1070, 697, 11, MUTED);
}
function button(
  ctx: CanvasRenderingContext2D,
  t: Target,
  label: string,
  active: boolean,
): void {
  ctx.save();
  const fill = ctx.createLinearGradient(t.x, t.y, t.x, t.y + t.h);
  fill.addColorStop(0, active ? "#dfc18b" : "#142832");
  fill.addColorStop(1, active ? "#b59b6b" : "#10212b");
  ctx.fillStyle = fill;
  ctx.fillRect(t.x, t.y, t.w, t.h);
  ctx.strokeStyle = active ? "#fff0cc" : "#40545b";
  ctx.lineWidth = 1;
  ctx.strokeRect(t.x + 0.5, t.y + 0.5, t.w - 1, t.h - 1);
  if (active) {
    ctx.strokeStyle = "#ecd8ac";
    ctx.strokeRect(t.x - 4, t.y - 4, t.w + 8, t.h + 8);
  }
  text(
    ctx,
    label,
    t.x + t.w / 2,
    t.y + t.h / 2 + 7,
    19,
    active ? "#18242a" : INK,
    "center",
  );
  if (active) text(ctx, "›", t.x + 24, t.y + t.h / 2 + 7, 23, "#293239");
  ctx.restore();
}
function menu(
  ctx: CanvasRenderingContext2D,
  s: DeepReadonly<FacetState>,
): void {
  const items =
    s.screen === "title"
      ? C.TITLE_ITEMS
      : s.screen === "paused"
        ? C.PAUSED_ITEMS
        : s.screen === "levelclear"
          ? C.LEVELCLEAR_ITEMS
          : C.GAMEOVER_ITEMS;
  for (const [i, t] of targets(s.screen).entries())
    button(ctx, t, items[i], s.menuIndex === i);
}
function title(
  ctx: CanvasRenderingContext2D,
  s: DeepReadonly<FacetState>,
): void {
  // A jeweller's display, distinct from the board and made from the produced stones.
  for (let i = 0; i < C.GEM_KIND_COUNT; i++) {
    const a = (i * Math.PI * 2) / C.GEM_KIND_COUNT - Math.PI / 2;
    const x = C.STAGE_CX + Math.cos(a) * 112,
      y = 162 + Math.sin(a) * 57;
    stone(
      ctx,
      {
        col: 0,
        row: 0,
        kind: C.GEM_KINDS[i],
        cut: "plain",
        strain: 0,
        fell: 0,
      },
      x,
      y,
      s.simTime,
      52,
    );
  }
  text(ctx, C.TITLE_TEXT, C.STAGE_CX, 307, 100, INK, "center", true);
  text(ctx, C.TAGLINE_TEXT, C.STAGE_CX, 348, 16, GOLD, "center");
  menu(ctx, s);
  text(
    ctx,
    "A puzzle of beautiful stones. And the pressure they hold.",
    C.STAGE_CX,
    624,
    16,
    MUTED,
    "center",
  );
  text(
    ctx,
    "DRAG TO SWAP  ·  MATCH TO SHATTER  ·  BUILD A CHAIN",
    C.STAGE_CX,
    655,
    11,
    GOLD,
    "center",
  );
}
function hud(ctx: CanvasRenderingContext2D, s: DeepReadonly<FacetState>): void {
  text(ctx, C.HUD_SCORE_LABEL, 352, 35, 11, GOLD);
  text(ctx, s.score.toLocaleString(), 352, 75, 32, INK);
  text(
    ctx,
    `${C.HUD_LEVEL_LABEL}  ${String(s.level).padStart(2, "0")}`,
    550,
    35,
    11,
    GOLD,
  );
  text(
    ctx,
    `${s.levelScore.toLocaleString()} / ${(s.level * C.LEVEL_TARGET_STEP).toLocaleString()}`,
    550,
    59,
    16,
    INK,
  );
  ctx.fillStyle = "#263a43";
  ctx.fillRect(550, 72, 370, 5);
  ctx.fillStyle = GOLD;
  ctx.fillRect(
    550,
    72,
    370 * Math.min(1, s.levelScore / (s.level * C.LEVEL_TARGET_STEP)),
    5,
  );
  button(ctx, targets("playing")[0], C.PAUSE_LABEL, false);
  text(ctx, "01 / THE FIELD", 48, 144, 12, GOLD);
  text(ctx, "Every clear", 48, 183, 25, INK, "left", true);
  text(ctx, "leaves pressure.", 48, 214, 25, INK, "left", true);
  rule(ctx, 48, 240, 226);
  text(ctx, "Match three stones of a kind.", 48, 270, 15, MUTED);
  text(ctx, "Watch the cracks deepen.", 48, 295, 15, MUTED);
  text(ctx, "Spend a flaw to start a chain.", 48, 320, 15, MUTED);
  text(ctx, "STRAIN", 48, 379, 11, GOLD);
  for (let n = 0; n <= C.MAX_STRAIN; n++) {
    stone(
      ctx,
      { col: 0, row: 0, kind: "ruby", cut: "plain", strain: n, fell: 0 },
      73 + n * 56,
      423,
      s.simTime,
      46,
    );
    text(
      ctx,
      ["CLEAN", "WORN", "CRACKED", "FLAWED"][n],
      73 + n * 56,
      470,
      9,
      n === 3 ? GOLD : MUTED,
      "center",
    );
  }
  text(ctx, "Flawed stones clear with a neighbor.", 48, 512, 13, MUTED);
  text(ctx, "Double the value. More of the board.", 48, 535, 13, MUTED);
  rule(ctx, 48, 560, 226);
  text(ctx, "HOLD → OFFER → RELEASE", 48, 592, 12, GOLD);
  text(ctx, "Return to the start to cancel.", 48, 617, 13, MUTED);
  text(ctx, "02 / THE CUTS", 980, 159, 12, GOLD);
  const cuts = ["brilliant", "star", "prism"] as const;
  for (let i = 0; i < cuts.length; i++) {
    const y = 213 + i * 105;
    stone(
      ctx,
      {
        col: 0,
        row: 0,
        kind: cuts[i] === "prism" ? null : "beryl",
        cut: cuts[i],
        strain: 0,
        fell: 0,
      },
      1008,
      y,
      s.simTime,
      48,
    );
    text(ctx, cuts[i].toUpperCase(), 1046, y - 9, 12, INK);
    text(
      ctx,
      ["4 in a line", "Crossing lines", "5 or more"][i],
      1046,
      y + 13,
      12,
      GOLD,
    );
    text(
      ctx,
      [
        "Clears the surrounding ring.",
        "Clears its row and column.",
        "Swap to clear one whole kind.",
      ][i],
      980,
      y + 48,
      12,
      MUTED,
    );
  }
  rule(ctx, 980, 530, 234);
  if (s.phase === "resolving") {
    text(ctx, C.HUD_CHAIN_LABEL, 980, 566, 12, GOLD);
    text(
      ctx,
      `×${Math.min(s.chainStep, C.MAX_MULTIPLIER)}`,
      980,
      622,
      48,
      INK,
      "left",
      true,
    );
    text(ctx, `+${s.lastPoints} points`, 1063, 606, 16, GOLD);
  } else {
    text(ctx, "THE NEXT MOVE IS YOURS", 980, 569, 11, GOLD);
    text(ctx, "Make the pressure count.", 980, 601, 16, MUTED);
  }
}
function drawBoard(
  ctx: CanvasRenderingContext2D,
  s: DeepReadonly<MotionState>,
): void {
  const frame = images.get("board-frame");
  if (frame) ctx.drawImage(frame, cellX(0) - 52, cellY(0) - 52, 608, 608);
  const shatterEnd = s.lastWaves * C.WAVE_SECONDS;
  ctx.save();
  ctx.beginPath();
  ctx.rect(
    cellX(0) - C.GEM_HIT_R,
    cellY(0) - C.GEM_HIT_R,
    C.GRID_COLS * C.CELL_PITCH,
    C.GRID_ROWS * C.CELL_PITCH,
  );
  ctx.clip();
  const motion = s.phase === "resolving" && s.visual;
  const beforeShatter = motion && s.stepTimer < shatterEnd;
  const drawCells = beforeShatter ? s.visual!.before.cells : s.board.cells;
  for (const g of drawCells) {
    const clear = beforeShatter
      ? s.visual!.cleared.find(
          (c) => c.gem.col === g.col && c.gem.row === g.row,
        )
      : undefined;
    if (clear && s.stepTimer >= clear.wave * C.WAVE_SECONDS) continue;
    let x = cellX(g.col),
      y = cellY(g.row);
    if (s.phase === "swapping" && s.swap) {
      const a = s.swap.a,
        b = s.swap.b;
      const t = Math.min(1, s.swapTimer / C.SWAP_SECONDS);
      const eased = t * t * (3 - 2 * t);
      if (g.col === a.col && g.row === a.row) {
        x += (cellX(b.col) - x) * (1 - eased);
        y += (cellY(b.row) - y) * (1 - eased);
      }
      if (g.col === b.col && g.row === b.row) {
        x += (cellX(a.col) - x) * (1 - eased);
        y += (cellY(a.row) - y) * (1 - eased);
      }
    } else if (s.phase === "resolving" && !beforeShatter) {
      const elapsed = Math.max(0, s.stepTimer - shatterEnd);
      const rowsRemaining = Math.max(
        0,
        g.fell - elapsed / C.FALL_SECONDS_PER_ROW,
      );
      y -= rowsRemaining * C.CELL_PITCH;
    } else if (
      s.phase === "idle" &&
      s.dealAt !== undefined &&
      s.simTime - s.dealAt < lastFall(s) * C.FALL_SECONDS_PER_ROW
    ) {
      y -=
        Math.max(0, g.fell - (s.simTime - s.dealAt) / C.FALL_SECONDS_PER_ROW) *
        C.CELL_PITCH;
    }
    if (s.selection && s.offer) {
      if (g.col === s.selection.col && g.row === s.selection.row) {
        x = cellX(s.offer.col);
        y = cellY(s.offer.row);
      } else if (g.col === s.offer.col && g.row === s.offer.row) {
        x = cellX(s.selection.col);
        y = cellY(s.selection.row);
      }
    }
    if (g.cut !== "plain")
      effect(ctx, "aura", x, y, s.simTime, g.col * 17 + g.row * 29);
    stone(ctx, g, x, y, s.simTime);
  }
  ctx.restore();
  if (motion) {
    for (const clear of s.visual!.cleared) {
      const age = s.stepTimer - clear.wave * C.WAVE_SECONDS,
        g = clear.gem,
        x = cellX(g.col),
        y = cellY(g.row);
      if (age >= 0 && age < 0.3 && g.kind)
        sprite(
          ctx,
          `break/${g.kind}/${Math.min(5, Math.floor(age / 0.05))}`,
          x,
          y,
        );
      effect(
        ctx,
        g.strain === C.MAX_STRAIN ? "flawed" : "clear",
        x,
        y,
        age,
        g.col * 97 + g.row * 31 + Math.floor(s.simTime - s.stepTimer) * 179,
      );
    }
    for (const c of s.visual!.created) {
      const gem = s.board.cells.find(
        (g) => g.col === c.col && g.row - g.fell === c.row && g.cut !== "plain",
      );
      if (gem)
        effect(
          ctx,
          "cut",
          cellX(gem.col),
          cellY(gem.row),
          s.stepTimer - shatterEnd - gem.fell * C.FALL_SECONDS_PER_ROW,
          c.col * 7 + c.row * 91,
        );
    }
  }
  if (s.selection) {
    const x = cellX(s.selection.col),
      y = cellY(s.selection.row);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 33, y - 33, 66, 66);
    if (s.offer) {
      ctx.strokeStyle = "#e8f9ef";
      ctx.strokeRect(cellX(s.offer.col) - 33, cellY(s.offer.row) - 33, 66, 66);
    }
  }
  if (s.refusal)
    for (const c of [s.refusal.a, s.refusal.b]) {
      ctx.strokeStyle = "#f27778";
      ctx.lineWidth = 2;
      ctx.strokeRect(cellX(c.col) - 33, cellY(c.row) - 33, 66, 66);
    }
}
function howto(
  ctx: CanvasRenderingContext2D,
  s: DeepReadonly<FacetState>,
): void {
  text(ctx, "THE ART OF PRESSURE", 80, 115, 44, INK, "left", true);
  text(ctx, "A small guide to a beautiful chain.", 80, 150, 17, GOLD);
  const blocks = [
    [
      "01",
      "Take hold. Let go.",
      "Seven kinds of gem fill the field. Hold a stone with a mouse, pen or",
      "finger, carry it onto a neighbor, then release. Return to the starting",
      "stone to cancel. Three or more of one kind in a line shatter; a move",
      "that clears nothing is refused, leaving the board unchanged.",
    ],
    [
      "02",
      "Pressure finds the flaw.",
      "Every stone beside a clear takes strain. Three cracks leave it flawed.",
      "A flawed stone shatters with any clear it touches, and scores double.",
      "New stones fall into the gaps. If they match, the chain continues —",
      "and each step is worth more, up to an eightfold multiplier.",
    ],
    [
      "03",
      "Earn a sharper edge.",
      "Four in a line leaves a brilliant: it clears the eight stones around it.",
      "Crossing lines leave a star: it clears its whole row and column.",
      "Five or more leave a prism: swap it to clear every stone of one kind.",
      "Reach the level target to continue. No productive move ends a round.",
    ],
  ];
  for (let i = 0; i < 3; i++) {
    const y = 207 + i * 135;
    const b = blocks[i];
    text(ctx, b[0], 80, y, 16, GOLD);
    text(ctx, b[1], 129, y, 25, INK, "left", true);
    for (let j = 2; j < b.length; j++)
      text(ctx, b[j], 129, y + 28 + (j - 2) * 21, 15, MUTED);
  }
  const x = 898;
  rule(ctx, x, 199, 302);
  text(ctx, "AT YOUR FINGERTIPS", x, 233, 12, GOLD);
  for (let i = 0; i < 4; i++) {
    stone(
      ctx,
      { col: 0, row: 0, kind: "ruby", cut: "plain", strain: i, fell: 0 },
      927 + i * 68,
      284,
      s.simTime,
      52,
    );
    text(
      ctx,
      ["CLEAN", "WORN", "CRACKED", "FLAWED"][i],
      927 + i * 68,
      327,
      10,
      i === 3 ? GOLD : MUTED,
      "center",
    );
  }
  text(ctx, "MENUS", x, 395, 12, GOLD);
  text(ctx, "↑ / ↓   Choose", x, 427, 16, INK);
  text(ctx, "Enter / Space   Confirm", x, 455, 16, INK);
  text(ctx, "P / Esc   Pause / resume", x, 483, 16, INK);
  text(ctx, "Esc   Back from this guide or round end", x, 511, 13, INK);
  text(ctx, "M   Toggle all sound", x, 539, 16, INK);
  button(ctx, targets("howto")[0], C.BACK_LABEL, false);
}
export function render(state: DeepReadonly<FacetState>, api: RenderApi): void {
  const ctx = api.ctx;
  ctx.imageSmoothingEnabled = false;
  field(ctx);
  text(ctx, state.muted ? "OFF" : "ON", 1173, 697, 11, GOLD);
  if (state.screen === "title") {
    title(ctx, state);
    return;
  }
  if (state.screen === "howto") {
    howto(ctx, state);
    return;
  }
  hud(ctx, state);
  drawBoard(ctx, state);
  if (state.screen !== "playing") {
    ctx.fillStyle = "#071219d9";
    ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
    ctx.fillStyle = "#122631";
    ctx.fillRect(400, 165, 480, 457);
    ctx.strokeStyle = "#655e4b";
    ctx.strokeRect(400.5, 165.5, 479, 456);
    const heading =
      state.screen === "paused"
        ? C.PAUSED_TITLE_TEXT
        : state.screen === "levelclear"
          ? C.LEVELCLEAR_TITLE_TEXT
          : C.GAMEOVER_TITLE_TEXT;
    text(
      ctx,
      heading,
      C.STAGE_CX,
      254,
      state.screen === "gameover" ? 39 : 46,
      INK,
      "center",
      true,
    );
    if (state.screen === "paused") {
      text(ctx, "The stones will wait.", C.STAGE_CX, 307, 17, MUTED, "center");
      text(
        ctx,
        "RESUME WHEN YOU’RE READY",
        C.STAGE_CX,
        365,
        11,
        GOLD,
        "center",
      );
    }
    if (state.screen === "levelclear") {
      text(
        ctx,
        `${C.HUD_LEVEL_LABEL} ${state.level}  /  COMPLETE`,
        C.STAGE_CX,
        293,
        12,
        GOLD,
        "center",
      );
      text(
        ctx,
        `${C.BEST_CHAIN_LABEL}   ${state.bestChain}`,
        C.STAGE_CX,
        337,
        17,
        INK,
        "center",
      );
      text(
        ctx,
        `${C.BEST_MOVE_LABEL}   ${state.bestMove.toLocaleString()}`,
        C.STAGE_CX,
        370,
        17,
        INK,
        "center",
      );
    }
    if (state.screen === "gameover") {
      text(
        ctx,
        `${C.HUD_SCORE_LABEL}   ${state.score.toLocaleString()}`,
        C.STAGE_CX,
        318,
        23,
        GOLD,
        "center",
      );
      text(
        ctx,
        `${C.HUD_LEVEL_LABEL}   ${state.level}`,
        C.STAGE_CX,
        365,
        16,
        MUTED,
        "center",
      );
    }
    menu(ctx, state);
  }
}
