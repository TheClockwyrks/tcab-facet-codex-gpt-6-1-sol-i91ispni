/* global window, AudioContext */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import process from "node:process";
import console from "node:console";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const failures = [];
const base = process.env.FACET_URL ?? "http://localhost:4174/dist/";
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => failures.push(e.message));
page.on("response", (r) => {
  if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`);
});
await page.addInitScript(() => {
  window.sampleStarts = [];
  const original = AudioContext.prototype.createBufferSource;
  AudioContext.prototype.createBufferSource = function () {
    const source = original.call(this),
      start = source.start;
    source.start = function (...args) {
      window.sampleStarts.push(this.buffer?.duration ?? 0);
      return start.apply(this, args);
    };
    return source;
  };
});
async function press(code) {
  await page.keyboard.press(code);
  await page.waitForTimeout(100);
}
await page.goto(base);
await page.waitForFunction(() => {
  const c = window.document.querySelector("canvas");
  return (
    c &&
    c.width === 1280 &&
    c.getContext("2d").getImageData(600, 410, 1, 1).data[0] > 100
  );
});
const title = await page.screenshot();
await press("ArrowDown");
await press("Enter");
await page.waitForTimeout(150);
assert.notDeepEqual(await page.screenshot(), title, "How to play must open");
await press("Escape");
await press("ArrowUp");
await press("Enter");
await page.waitForTimeout(700);
const board = await page.screenshot();
assert.ok(
  await page
    .locator("canvas")
    .evaluate(
      (c) => c.getContext("2d").getImageData(340, 100, 1, 1).data[0] > 150,
    ),
  "The board frame must be visible",
);
assert.notDeepEqual(board, title, "Play must draw a board");
await page.mouse.move(388, 144);
await page.mouse.down();
await page.waitForTimeout(70);
await page.mouse.move(460, 144);
await page.waitForTimeout(70);
await page.mouse.up();
await page.waitForTimeout(250);
await page.mouse.click(1128, 68);
await page.waitForTimeout(80);
const pause = await page.screenshot();
await page.mouse.click(640, 456);
await page.waitForTimeout(80);
assert.notDeepEqual(await page.screenshot(), pause, "Pointer Resume must work");
assert.ok(
  (await page.evaluate(() => window.sampleStarts.length)) >= 4,
  "Produced music and cues must start through Web Audio",
);
assert.ok(
  await page.evaluate(() => window.sampleStarts.every((d) => d > 0)),
  "Every sample must have a nonzero duration",
);
await press("KeyM");
await page.waitForTimeout(100);
await press("KeyP");
await page.waitForTimeout(100);
await press("Escape");
for (const options of [
  {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  },
  { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 },
]) {
  const context = await browser.newContext(options);
  const p = await context.newPage();
  p.on("pageerror", (e) => failures.push(e.message));
  p.on("response", (r) => {
    if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`);
  });
  await p.goto(base);
  await p.waitForTimeout(700);
  const width = options.viewport.width,
    height = options.viewport.height;
  const scale = Math.min(width / 1280, height / 720);
  const ox = (width - 1280 * scale) / 2,
    oy = (height - 720 * scale) / 2;
  if (options.hasTouch)
    await p.touchscreen.tap(ox + 640 * scale, oy + 426 * scale);
  else await p.mouse.click(ox + 640 * scale, oy + 426 * scale);
  await p.waitForTimeout(700);
  const canvas = await p
    .locator("canvas")
    .evaluate((c) => ({ w: c.width, h: c.height }));
  assert.equal(canvas.w, width * 2);
  assert.equal(canvas.h, height * 2);
  if (options.hasTouch) {
    await p.touchscreen.tap(ox + 1128 * scale, oy + 68 * scale);
    await p.waitForTimeout(100);
    await p.touchscreen.tap(ox + 640 * scale, oy + 456 * scale);
  }
  await context.close();
}
assert.deepEqual(failures, []);
console.log(
  "Production sub-path, mouse, touch, menus, audio, resizing and DPR checks passed.",
);
await browser.close();
