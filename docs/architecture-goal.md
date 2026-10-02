# Architecture goal

Authorized: implement all five architecture improvements, preserving browser-only operation, persisted keys/data, extension protocol, existing UI and hosting configuration.

Slices (each tested, deployed, browser-proven and pushed independently):
1. Property identity: canonical keys and building membership; preserve existing stored keys.
2. Selection/navigation: consolidate opening, closing, manager return, drawing and URL coordination; protect against stale async responses.
3. Browser storage inventory: classify durable user data, settings and disposable caches; derive backup/clear policies without silently deleting data.
4. Published KO datasets: shared cache/revalidation/offline loader with concrete valuation and ETN adapters.
5. Map layers: declarative ownership, installation, order and interaction; remove fragile prefix-based classification.

Done: all five integrated through existing callers, regression tests green, TypeScript and all workspace tests green, production desktop/mobile proof, both remotes published. Stop on failed proof or destructive migration needing approval. No new backend, dataset or extension permissions.

Status: all five slices complete. See slice notes and final audit below.

Slice 2 complete: selection/useSelection owns property entry points, selection transitions, manager return context, polygon drawing and URL writes. Existing detail loaders remain private collaborators; navigation has a shared generation guard, in addition to loader guards, so late finds/details cannot reopen closed views or fall back to another property. MapPage only coordinates presentation. Regression coverage includes close during details, stale map fallback, manager return and drawing. No schema or protocol changes.

Slice 3 complete: data/inventory owns database names/classifications, legacy names, setting keys and backup/cache policy. DataModal binds concrete adapters; the complete adapter map is type-checked. GURS mixed storage clears through its existing pin-aware implementation. Backups keep their format and legacy settings; disposable datasets are excluded. CacheStorage deletion is now app-scoped. No database schemas or data migrations changed. Regression tests exercise export/restore, pins/quota/list preservation and unrelated-cache isolation. Queue UI test now awaits the retry button (summary can update before runner completion).

Slice 4 complete: datasets/loader owns v1 Dexie persistence, seven-day TTL, negative caching, stale-on-failure and in-flight deduplication. Values and ETN are concrete path/shape adapters; no longer coupled through the values module. Existing exported factories/types/constants remain compatible. Parameterized adapter tests verify persisted reuse, concurrent dedupe, expiry, offline fallback, clear and 404. Production desktop/mobile values and ETN verified; warm reload performs zero dataset requests.

Slice 5 complete: map/appLayers declares each GeoJSON source and its styles, owns idempotent installation/update and marker interaction routing. Ownership is derived from layer definitions plus GURS raster declarations, not prefixes. Existing raster-before-label placement and ortho styling stay in MapView; they consume declared ownership. Theme changes reinstall the same definitions. Tests cover arbitrary names, exclusion from basemap labels, update/reinstallation and real layer IDs (the old test incorrectly used sel-fill instead of selection-fill).

## Final audit
All five authorized improvements are integrated and deployed. Property keys and database schemas remain compatible; backup and extension protocols are unchanged. Selection/navigation regression guards, typed storage inventory, shared dataset cache policy, and declared map ownership are covered by tests. Production proofs covered persisted list identity, navigation/manager return, backup/cache clearing, dataset warm-cache loading, ortho markers/clicks and mobile theme reinstallation. No further continuation is needed. Existing store publishing and deferred snapshots remain out of scope.
