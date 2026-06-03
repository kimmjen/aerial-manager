// Capture docs/screenshot.png from the running dev server using system Chrome.
// Usage: npm run dev (in another terminal), then npm run screenshot
import { chromium } from "playwright-core";

const URL = process.env.SCREENSHOT_URL ?? "http://localhost:3210/";
const OPEN_MENU = process.env.OPEN_MENU === "1";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });
await page.goto(URL, { waitUntil: "load" });

// wait until every video preview has decoded a frame (HAVE_CURRENT_DATA)
await page
  .waitForFunction(
    () => {
      const vids = [...document.querySelectorAll("video")];
      return vids.length > 0 && vids.every((v) => v.readyState >= 2);
    },
    { timeout: 20000 },
  )
  .catch(() => console.warn("some videos did not load a frame in time"));
await page.waitForTimeout(500);

if (OPEN_MENU) {
  await page.getByRole("button", { name: "Apply to ▾" }).first().click();
  await page.waitForTimeout(300);
}

await page.screenshot({ path: "docs/screenshot.png" });
await browser.close();
console.log("wrote docs/screenshot.png");
