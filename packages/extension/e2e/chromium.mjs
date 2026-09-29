// Manual/CI-optional e2e: loads the unpacked Chrome build into real Chromium and checks the live app.
// Usage: PLAYWRIGHT_CORE=/path/to/playwright-core CHROMIUM=/path/to/chrome node e2e/chromium.mjs [appUrl] [screenshotDir]
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const pw = await import(process.env.PLAYWRIGHT_CORE ?? "playwright-core");
const chromium = pw.chromium ?? pw.default.chromium;
const ext = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "chrome");
const app = process.argv[2] ?? (() => { throw new Error("usage: node e2e/chromium.mjs <app url>"); })();
const shots = process.argv[3];
const results = [];
const check = (name, ok, extra = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " - " + extra : ""}`); };

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "ikataster-e2e-")), {
  executablePath: process.env.CHROMIUM, headless: true,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, "--headless=new"],
});
try {
  let [sw] = ctx.serviceWorkers();
  sw ??= await ctx.waitForEvent("serviceworker", { timeout: 15000 });
  const extId = new URL(sw.url()).host;
  check("extension service worker running", !!extId, extId);

  const page = await ctx.newPage();
  await page.goto(app, { waitUntil: "domcontentloaded" });
  const openCart = async () => { await page.getByRole("button", { name: /^Košarica/ }).click(); };
  await openCart();
  const status = page.getByTestId("extension-status");
  await status.getByText("Razširitev iKataster je povezana").waitFor({ timeout: 10000 });
  check("app detects extension", true, (await status.innerText()).replace(/\s+/g, " "));
  check("app reports no eZK tab", (await status.innerText()).includes("Zavihek e-ZK ni odprt."));
  if (shots) { await page.waitForTimeout(800); await page.screenshot({ path: join(shots, "x2-detected.png") }); }

  const ezk = await ctx.newPage();
  await ezk.goto("https://esodisce.si/evlozisce/javni_izpisi/list.html", { waitUntil: "commit", timeout: 20000 }).catch((e) => console.log("eZK load:", e.message));
  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await status.getByText("Zavihek e-ZK je odprt.").waitFor({ timeout: 10000 }).then(() => check("app sees open eZK tab", true), () => check("app sees open eZK tab", false));

  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.locator("#status").filter({ hasText: /odprt/ }).waitFor({ timeout: 5000 });
  check("popup shows eZK tab status", (await popup.locator("#status").innerText()) === "Zavihek e-ZK je odprt.", await popup.locator("#status").innerText());
  if (shots) await popup.screenshot({ path: join(shots, "x-popup.png") });
  await ezk.close();
  await popup.reload();
  await popup.locator("#status").filter({ hasText: /odprt/ }).waitFor({ timeout: 5000 });
  check("popup shows closed state", (await popup.locator("#status").innerText()) === "Zavihek e-ZK ni odprt.");

  // foreign origin: relay must not be injected, so no ready/response ever arrives
  const foreign = await ctx.newPage();
  await foreign.goto("https://example.com/", { waitUntil: "domcontentloaded" });
  const foreignReply = await foreign.evaluate(() => new Promise((r) => {
    window.addEventListener("message", (e) => { if (e.data?.source === "ikataster-ext") r(e.data); });
    window.postMessage({ source: "ikataster-app", v: 1, id: "x", type: "status" }, "*");
    setTimeout(() => r(null), 2000);
  }));
  check("foreign origin gets no reply", foreignReply === null);

  // cross-origin iframe inside the app must not be able to drive the relay
  const iframeReply = await page.evaluate(() => new Promise((r) => {
    const f = document.createElement("iframe");
    f.srcdoc = `<script>parent.postMessage({source:"ikataster-app",v:1,id:"evil",type:"status"},"*")<\/script>`;
    window.addEventListener("message", (e) => { if (e.data?.source === "ikataster-ext" && e.data.id === "evil") r(e.data); });
    document.body.appendChild(f);
    setTimeout(() => r(null), 2000);
  }));
  check("iframe message rejected", iframeReply === null);
} finally {
  await ctx.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
