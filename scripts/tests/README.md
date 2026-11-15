# Browser smoke tests

`npm run test:runner` checks that the actual root workspace command exits unsuccessfully if an earlier workspace fails and the last passes. It uses disposable packages, not the app's tests.

`npm run test:browser` builds and serves the app locally, then runs Chromium scenarios:

1. Address search → property → extract list → reload retains the item.
2. Upload a synthetic 03-001-shaped PDF through the file input; real pdf.js parses it and IndexedDB retains the result.
3. Download a backup, restore into a clean browser context, and verify both list and extract after the app reloads.

Requirements: Node 22+. From a fresh checkout run `npm ci`, then `npx playwright-core install chromium` (Linux may also require browser system libraries). `playwright-core` is a pinned root dev dependency. The default PDF is generated entirely from invented text by `synthetic-pdf.mjs`, in memory, and never served by the app. It verifies Unicode extraction and the property section, not realistic multi-page ownership/rights layout. Local private parser fixtures retain that deeper coverage. Optionally set `EZK_TEST_PDF` to an absolute local extract path; a missing override fails explicitly. Keep local reports private. `PLAYWRIGHT_CORE` is an optional module-path override.

Example on the Pi (run browser jobs outside the mom cgroup with a 1500M memory limit):

```sh
PLAYWRIGHT_CORE=/usr/lib/node_modules/agent-browser/node_modules/playwright-core \
EZK_TEST_PDF=/absolute/path/to/local/test-extract.pdf npm run test:browser
```

The browser uses the production bundle and isolated browser contexts. Network responses under `/mirror/` come from the small real public-data fixture used by the integration tests. Valuation responses are empty; external basemaps, GURS and telemetry are blocked. Thus the tests verify UI/storage/PDF/download integration, not external service availability or rendered map pixels. Service workers are blocked to keep routed fixtures deterministic. Actual Safari/touch and live SI-PASS extension behavior remain separate manual checks.

The runner always closes Chromium and its temporary preview server. It binds port 4178 strictly; an occupied port is an error. No production deployment is needed for test-only changes.
