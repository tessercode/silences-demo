// Report chart text that falls outside its overflow-hidden scroll box, for every segmenter view at
// desktop and phone widths, and any page overflowing the viewport sideways. Exit 1 if anything does.
// Usage: node tools/clip_check.mjs <url> [--browser=chromium|firefox|webkit]
import { browserFromArgs } from "./browsers.mjs";

const { name, engine, args } = browserFromArgs();
const url = args[0] ?? "http://localhost:8080/";
const browser = await engine.launch();
let bad = 0;
for (const width of [1280, 390]) {
  for (const seg of ["lif", "mlp", "bigru", "oracle", "compare"]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto(url);
    await page.waitForSelector("#pipeline:not(.hidden)", { timeout: 180000 });
    if (seg !== "lif") {
      await page.click(`#segmenter button[data-seg="${seg}"]`);
      await page.waitForTimeout(300);
      await page.waitForFunction(() => document.querySelector("#status").classList.contains("hidden"), null, { timeout: 60000 });
      await page.waitForTimeout(300);
    }
    const found = await page.evaluate(() => {
      const out = [];
      for (const box of document.querySelectorAll(".gapscroll, .hscroll")) {
        if (box.offsetParent === null) continue;
        const r = box.getBoundingClientRect();
        for (const t of box.querySelectorAll("text")) {
          const q = t.getBoundingClientRect();
          if (q.height && (q.bottom > r.bottom + 0.5 || q.top < r.top - 0.5))
            out.push(`${box.id || box.parentElement.id}: "${t.textContent}"`);
        }
      }
      const sideways = document.documentElement.scrollWidth - window.innerWidth;
      if (sideways > 0) out.push(`page scrolls sideways by ${sideways} px`);
      return [...new Set(out)];
    });
    bad += found.length;
    console.log(`${name} ${width}px ${seg}: ${found.length ? found.length + " problem(s)\n  " + found.slice(0, 6).join("\n  ") : "ok"}`);
    await page.close();
  }
}
await browser.close();
process.exit(bad ? 1 : 0);
