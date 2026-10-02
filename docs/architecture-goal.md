# Architecture goal

Authorized: implement all five architecture improvements, preserving browser-only operation, persisted keys/data, extension protocol, existing UI and hosting configuration.

Slices (each tested, deployed, browser-proven and pushed independently):
1. Property identity: canonical keys and building membership; preserve existing stored keys.
2. Selection/navigation: consolidate opening, closing, manager return, drawing and URL coordination; protect against stale async responses.
3. Browser storage inventory: classify durable user data, settings and disposable caches; derive backup/clear policies without silently deleting data.
4. Published KO datasets: shared cache/revalidation/offline loader with concrete valuation and ETN adapters.
5. Map layers: declarative ownership, installation, order and interaction; remove fragile prefix-based classification.

Done: all five integrated through existing callers, regression tests green, TypeScript and all workspace tests green, production desktop/mobile proof, both remotes published. Stop on failed proof or destructive migration needing approval. No new backend, dataset or extension permissions.

Status: slice 1 complete; slice 2 next. Identity is shared by extract-list storage, extract storage, import deduplication, result membership and map position keys. GURS compound table keys and mock response hashes are deliberately not changed (different purposes).
