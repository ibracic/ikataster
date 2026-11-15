/** Built-app smoke tests. Real UI, IndexedDB, pdf.js and downloads. Only network boundaries are substituted. */
import { syntheticPdf } from './synthetic-pdf.mjs';
import { createRequire } from 'node:module';
import { readFile, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const root = resolve(import.meta.dirname, '../..');
const pdf = process.env.EZK_TEST_PDF;
if (pdf) await access(pdf);
try { await fetch('http://127.0.0.1:4178'); throw new Error('Port 4178 is already occupied'); } catch (e) { if (e.message === 'Port 4178 is already occupied') throw e; }
const server = spawn('npm', ['run', 'preview', '-w', '@ikataster/web', '--', '--host', '127.0.0.1', '--port', '4178', '--strictPort'], { cwd: root, stdio: 'ignore', detached: true });
const url = 'http://127.0.0.1:4178';
let browser;
try {
  for (let i = 0; ; i++) { try { if ((await fetch(url)).ok) break; } catch {} if (i > 100 || server.exitCode !== null) throw new Error('Preview failed to start'); await new Promise(r => setTimeout(r, 100)); }
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const external = [];
  async function context() {
    const c = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
    await c.route('**/*', async route => {
      const u = new URL(route.request().url());
      if (u.origin === url) {
        if (u.pathname.startsWith('/mirror/')) {
          try { return await route.fulfill({ body: await readFile(resolve(root, 'apps/web/src/mirror/__fixtures__/site', u.pathname.slice(8))), contentType: 'application/json' }); }
          catch { return route.fulfill({ status: 404 }); }
        }
        return route.continue();
      }
      external.push(u.href);
      // Data boundaries only: keep cadastre reads on the real published-copy fixture.
      if (u.hostname === 'raw.githubusercontent.com') return route.fulfill({ json: { date: '2026-11-13', p: {}, d: {} } });
      return route.abort(); // no live GURS / basemap / telemetry dependency
    });
    return c;
  }
  let c = await context(); let p = await c.newPage();
  await p.goto(url);
  await p.getByRole('textbox', { name: 'Naslov', exact: true }).fill('Koroška cesta 12a');
  await p.getByText('Koroška cesta 12a', { exact: true }).first().click();
  await p.getByTestId('parcel-panel').waitFor();
  await p.getByRole('button', { name: 'Dodaj za izpis ZK', exact: true }).click();
  await p.getByTestId('cart-count').filter({ hasText: '1' }).waitFor();
  await p.reload();
  await p.getByTestId('cart-count').filter({ hasText: '1' }).waitFor();
  console.log('PASS: address search → property → extract list survives reload');

  await p.getByRole('button', { name: /^Izpisi iz zemljiške knjige/ }).click();
  await p.getByTestId('tab-done').click();
  await p.locator('input[type=file][accept*="pdf"]').setInputFiles(pdf || { name: 'synthetic-extract.pdf', mimeType: 'application/pdf', buffer: syntheticPdf() });
  await p.getByTestId('results-panel').getByText(/Dodanih izpisov: 1/).waitFor({ timeout: 20000 });
  assert.equal(await p.locator('[data-testid="results-panel"] [data-testid="result-group"]').count(), 1);
  console.log('PASS: PDF upload parsed by real pdf.js and shown in results');
  await p.locator('.mantine-Modal-close').click();

  await p.getByRole('button', { name: 'Podatki', exact: true }).click();
  const download = p.waitForEvent('download');
  await p.getByRole('button', { name: /Shrani kopijo/ }).click();
  const saved = await download;
  const path = await saved.path();
  // New browser context: no existing IndexedDB, caches, settings or results.
  const fresh = await context(); const q = await fresh.newPage();
  await q.goto(url);
  await q.getByRole('button', { name: 'Podatki', exact: true }).click();
  await q.locator('input[type=file][accept*="zip"]').setInputFiles(path);
  await q.getByTestId('restore-confirm').waitFor();
  await q.getByRole('button', { name: 'Zamenjaj vse podatke', exact: true }).click();
  await q.getByTestId('cart-count').filter({ hasText: '1' }).waitFor();
  await q.getByRole('button', { name: /^Izpisi iz zemljiške knjige/ }).click();
  await q.getByTestId('tab-done').click();
  await q.getByTestId('results-panel').locator('[data-testid="result-group"]').waitFor();
  console.log('PASS: downloaded backup restores list and parsed extract into a clean browser');
  assert(!external.some(u => /wfs-si|jv-api/.test(u)), 'cadastre must not query live GURS');
  await fresh.close(); await c.close();
} finally {
  await browser?.close();
  try { process.kill(-server.pid, 'SIGTERM'); } catch {}
}
