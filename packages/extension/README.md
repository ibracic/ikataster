# iKataster browser extension (MV3)

Connects the iKataster app (origin set at build time via `IKATASTER_ORIGINS`) to e-ZK (esodisce.si) using the user's own SI-PASS session. No server involved.

- `src/relay.ts` – content script on the app origin only; `window.postMessage` <-> `chrome.runtime`, strict same-window/same-origin/allowlist checks (`acceptWindowMessage` from `@ikataster/bridge`).
- `src/background.ts` – worker; accepts only its own relay on allowed origins (`FORBIDDEN_ORIGIN` otherwise). `hello`, `status` ({ezkTab}); `download` arrives with #10.
- `src/popup.*` – shows whether an esodisce.si tab is open, opens/focuses it.
- `src/manifest.ts` – Chrome/Edge (background service worker) vs Firefox (background scripts, gecko id `ikataster@ikataster`, min 140).

Protocol: `packages/bridge` (typed messages, request ids, 90 s timeout, hello/ready, mock transport).

```
npm test -w @ikataster/extension
node packages/extension/build.mjs            # dist/chrome, dist/firefox + zips
# real-browser check (optional):
PLAYWRIGHT_CORE=/path/playwright-core/index.js CHROMIUM=/path/chrome node packages/extension/e2e/chromium.mjs
npx web-ext lint --source-dir packages/extension/dist/firefox
```

App dev: `?bridge=mock` uses the in-page mock transport (remembered in localStorage), `?bridge=extension` switches back.
