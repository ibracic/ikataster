# Domain language

- **Property**: a cadastral parcel, building, or building part, identified within a cadastral municipality (KO).
- **Property identity**: kind + KO + number, plus part number for building parts. Parcel numbers retain slash notation. Existing persisted identity strings must remain stable.
- **Extract**: a parsed land-registry PDF. A building view includes extracts for the building and its parts, never a same-number parcel.
- **Selection**: the property, manager portfolio or drawn area currently being explored; distinct from the extract list.
- **Published KO dataset**: downloadable valuations or ETN records partitioned by cadastral municipality; replaceable cache, not user-authored data.


# Architecture boundaries

- **Cadastre copy**: `gurs/instance.ts` composes `cadastre/copy.ts` over the published mirror and pinned-KO store. Parcel, building, part, address, manager and area queries use this copy; a missing property is final, not a reason to query upstream.
- **Live GURS exception**: `gurs/live.ts` supplies only EUP lookup for old saved KO data without embedded planning units. Orthophoto images are also fetched from GURS. Current copy datasets already contain EUPs.
- **Published data**: mirror builders publish compact KO JSON and map vector tiles. Valuations and ETN use the shared `datasets/loader.ts` with replaceable per-KO caches. Dates shown to users come from published metadata.
- **Browser storage**: `data/inventory.ts` owns database/settings inventory and backup scope. User-authored extract lists, parsed PDFs, folders and queue state must be preserved. The GURS database stores pinned KOs; derived dataset caches are disposable. No backend or user accounts.
- **Extract UI**: `ezk/ExtractsModal.tsx` is the only extract container, with `cart/CartPanel.tsx` and `ezk/ResultsPanel.tsx` for its two tabs. The parser, queue and extension bridge remain separate from presentation.
- **Hosting**: production is static Cloudflare Pages (`public/_headers`). Docker/nginx remain supported self-hosting alternatives, not the production deployment.
- **Tests**: pure logic under Node, UI integration under jsdom with the real copy client and small public-data fixture. `scripts/tests/browser.mjs` checks built-app UI/storage/PDF/download behavior in Chromium; it substitutes network boundaries only. It does not verify map pixels, Safari or SI-PASS. See `scripts/tests/README.md`.
