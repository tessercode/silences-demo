// Open the app in headless Chromium, wait for a decode, and save full-page screenshots.
// Usage: node tools/screenshot.mjs <url> <out-prefix> [segmenter] [light|dark] [width] [--browser=...]
import { browserFromArgs } from "./browsers.mjs";

const { engine, args } = browserFromArgs();
const [url, out, seg = "lif", scheme = "light", width = "1280"] = args;
const browser = await engine.launch();
const page = await browser.newPage({ viewport: { width: +width, height: 900 }, colorScheme: scheme });
const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
const t0 = Date.now();
await page.goto(url);
await page.waitForSelector("#pipeline:not(.hidden)", { timeout: 120000 });
console.log(`first decode after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
if (seg !== "lif") {
  await page.click(`#segmenter button[data-seg="${seg}"]`);
  await page.waitForFunction(() => document.querySelector("#status").classList.contains("hidden"));
  await page.waitForTimeout(300);
}
await page.screenshot({ path: `${out}.png`, fullPage: true });
console.log(logs.filter((l) => !l.includes("[debug]")).join("\n"));
await browser.close();
