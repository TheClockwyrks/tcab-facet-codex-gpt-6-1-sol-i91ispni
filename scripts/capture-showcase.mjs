/* global document */
import { chromium } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import process from "node:process";
import console from "node:console";

// Run against npm run dev. The automation owns a separate engine and canvas;
// the production game publishes no global handle or debug methods.
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const failures = [];
page.on("pageerror", (error) => failures.push(error.message));
await page.goto(process.env.FACET_URL ?? "http://localhost:5173");
await page.waitForTimeout(500);
const engine = await page.evaluateHandle(async () => {
  const { game, BACKGROUND } = await import("/src/game.ts");
  const { createEngine, ConstantClock } =
    await import("/node_modules/@clockwyrks/simple-2d/dist/index.js");
  const oldCanvas = document.getElementById("stage");
  oldCanvas.remove();
  const canvas = document.createElement("canvas");
  canvas.id = "stage";
  document.body.append(canvas);
  const engine = createEngine({
    canvas,
    width: 1280,
    height: 720,
    background: BACKGROUND,
    game,
    clock: new ConstantClock(1000 / 30),
  });
  await engine.initialize();
  await engine.advance(1);
  return engine;
});
await mkdir("showcase", { recursive: true });
await page.screenshot({ path: "showcase/title.png" });
await engine.evaluate(async (e) => {
  const letters = "RACJBSM";
  const rows = Array.from({ length: 8 }, (_, r) =>
    Array.from({ length: 8 }, (_, c) => letters[(r * 2 + c) % 7] + "0").join(
      " ",
    ),
  );
  e.apply((s) => e.debug.setScreen(e.debug.loadBoard(s, rows), "playing"));
  // A legal swap whose clear crosses a flawed corner, a brilliant and a star.
  const gems = [
    [0, 7, "R0"],
    [1, 7, "A0"],
    [2, 7, "R0"],
    [1, 6, "R0"],
    [3, 7, "J3"],
    [3, 6, "B3b"],
    [4, 6, "S0s"],
    [4, 5, "M3"],
    [5, 5, "J3"],
    [5, 4, "A3"],
    [6, 4, "C2"],
    [6, 5, "B2"],
    [0, 0, "R0"],
    [1, 0, "A0"],
    [2, 0, "R0"],
    [1, 1, "R0"],
    [6, 2, "X0"],
    [1, 3, "M1s"],
    [0, 5, "J2"],
    [2, 3, "C2"],
  ];
  for (const [c, r, token] of gems)
    e.apply((s) => e.debug.setGem(s, c, r, token));
  // A repeatable refill still runs the normal gravity and matching rules.
  for (let c = 0; c < 8; c++)
    e.apply((s) =>
      e.debug.setRefillKinds(
        s,
        c,
        Array.from({ length: 8 }, (_, r) => letters[(r * 2 + c) % 7]).join(""),
      ),
    );
  await e.advance(1);
});
await page.screenshot({ path: "showcase/board.png" });
const recording = await engine.evaluate(async (e) => {
  e.startRecording();
  await e.advance(15);
  e.apply((s) => e.debug.pointerDown(s, 460, 576, "mouse"));
  await e.advance(4);
  e.apply((s) => e.debug.pointerDown(s, 460, 648, "mouse"));
  await e.advance(5);
  e.apply((s) => e.debug.pointerUp(s, "mouse"));
  await e.advance(19);
  return null;
});
void recording;
await page.screenshot({ path: "showcase/pressure.png" });
const capture = await engine.evaluate(async (e) => {
  await e.advance(135);
  return { recording: e.stopRecording(), snapshot: e.debug.snapshot(e.state) };
});
await writeFile(
  "showcase/chain.json.gz",
  gzipSync(JSON.stringify(capture.recording)),
);
console.log(
  "Captured",
  capture.recording.frames.length,
  "frames; deepest chain",
  capture.snapshot.bestChain,
);
console.log("Browser errors:", failures);
await engine.evaluate((e) => e.destroy());
await browser.close();
if (failures.length) throw new Error(failures.join("\n"));
