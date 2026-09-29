import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import {
  ActionIcon, Alert, Badge, Button, Group, Paper, Popover, SegmentedControl, Stack, Switch, Text, Title, Tooltip,
  useComputedColorScheme, useMantineColorScheme,
} from "@mantine/core";
import { IconDatabase, IconLanguage, IconMoon, IconPolygon, IconFileText, IconStack2, IconSun, IconUsers } from "@tabler/icons-react";
import { ResultsModal } from "../ezk/ResultsModal";
import { useResults } from "../ezk/useResults";
import type { ResultRecord } from "../ezk/results";
import { MapView } from "../map/MapView";
import type { BasemapId, OverlayId } from "../map/layers";
import { useI18n } from "../i18n";
import { useGurs } from "../gurs/instance";
import { useKos } from "../gurs/useKos";
import { ParcelSearch } from "../features/parcel/ParcelSearch";
import { AddressSearch } from "../features/parcel/AddressSearch";
import type { Address } from "../gurs";
import { ParcelPanel } from "../features/parcel/ParcelPanel";
import { useParcelSelection } from "../features/parcel/useParcelSelection";
import { BuildingPanel } from "../features/building/BuildingPanel";
import { useBuildingSelection } from "../features/building/useBuildingSelection";
import { CartDrawer } from "../cart/CartDrawer";
import { useCart } from "../cart/useCart";
import type { CartItem } from "../cart/store";
import type { FeatureCollection } from "geojson";
import { AreaPanel } from "../features/area/AreaPanel";
import { ImportModal } from "../import/ImportModal";
import { DataModal } from "../data/DataModal";
import { InstallHint } from "../pwa/InstallHint";
import { UpdateToast } from "../pwa/UpdateToast";
import { useOffline } from "../offline/instance";
import { pinMaxAgeDays, refreshStale } from "../offline/pins";
import { ManagerSearch } from "../features/manager/ManagerSearch";
import { ManagerPanel } from "../features/manager/ManagerPanel";
import type { Geometry } from "geojson";
import "./app.css";

/** Parcels are only clickable once they are drawn (GURS WMS min zoom). */
const CLICK_MIN_ZOOM = 15;
/** Building outlines are drawn from z17; clicks there prefer buildings. */
const BUILDING_CLICK_ZOOM = 17;

type Mode = "address" | "parcel" | "building" | "manager";

/** Remembered basemap (street map or orthophoto). */
export const BASEMAP_KEY = "ikataster.basemap";

export function MapPage() {
  const { t, lang, setLang } = useI18n();
  const { setColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme("light");
  const gurs = useGurs();
  const offline = useOffline();
  // Stale pinned KOs refresh in the background once per app open.
  useEffect(() => { void refreshStale(gurs, offline, pinMaxAgeDays()).catch(() => undefined); }, [gurs, offline]);
  const { kos } = useKos(gurs);
  const sel = useParcelSelection(gurs);
  const bld = useBuildingSelection(gurs);
  const cart = useCart();
  const [cartOpen, setCartOpen] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const results = useResults();
  const [importOpen, setImportOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  /** Polygon selection: drawing (points) → done (ring fixed, AreaPanel open). */
  const [draw, setDraw] = useState<{ points: [number, number][]; done: boolean } | null>(null);
  const startDraw = () => { sel.clear(); bld.clear(); setParams({}, { replace: true }); setDraw({ points: [], done: false }); };
  const cartFc = useMemo<FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: cart.items.filter((i) => i.geometry).map((i) => ({ type: "Feature", properties: { key: i.key }, geometry: i.geometry! })),
  }), [cart.items]);
  const [params, setParams] = useSearchParams();
  const [basemap, setBasemapState] = useState<BasemapId>(() => (localStorage.getItem(BASEMAP_KEY) === "ortho" ? "ortho" : "street"));
  const setBasemap = (b: BasemapId) => { setBasemapState(b); try { localStorage.setItem(BASEMAP_KEY, b); } catch { /* private mode */ } };
  const [overlays, setOverlays] = useState<Record<OverlayId, boolean>>({ parcels: true, buildings: true });
  const [labels, setLabels] = useState(true);
  const [zoom, setZoom] = useState(0);
  const [fitKey, setFitKey] = useState(0);
  const [mode, setMode] = useState<Mode>(() => (params.get("upr") ? "manager" : params.get("st") ? "building" : params.get("ko") ? "parcel" : "address"));
  /** Manager (upravnik) view: id + optional KO filter, deep link ?upr=617&ko=657. */
  const [manager, setManager] = useState<{ id: number; ko: number | null } | null>(() => {
    const id = Number(params.get("upr"));
    return Number.isInteger(id) && id > 0 ? { id, ko: Number(params.get("ko")) || null } : null;
  });
  const [managerGeom, setManagerGeom] = useState<Geometry | null>(null);
  const openManager = (id: number, ko: number | null = null) => {
    sel.clear(); bld.clear(); setDraw(null); setMode("manager");
    setManager({ id, ko });
    setParams(ko ? { upr: String(id), ko: String(ko) } : { upr: String(id) }, { replace: true });
  };
  const [managerPts, setManagerPts] = useState<FeatureCollection | null>(null);
  const [areaFc, setAreaFc] = useState<FeatureCollection | null>(null);
  const onManagerHighlight = useCallback((g: Geometry | null, pts?: FeatureCollection | null) => { setManagerGeom(g); setManagerPts(pts ?? null); if (g) setFitKey((k) => k + 1); }, []);

  const initialKo = Number(params.get("ko")) || undefined;
  const initialParcel = params.get("p") ?? undefined;
  const initialBuilding = params.get("st") ?? undefined;

  /** `fromManager`: open on top of the manager list, which stays loaded (search, filter, scroll). */
  const showBuilding = async (ko: number, st: number, fromManager = false) => {
    sel.clear();
    if (!fromManager) { setManager(null); setManagerGeom(null); }
    const b = await bld.search(ko, st);
    if (b) {
      if (!fromManager) setParams({ ko: String(b.koId), st: String(b.number) }, { replace: true });
      setFitKey((k) => k + 1);
    }
  };
  const backToManager = () => { bld.clear(); setFitKey((k) => k + 1); };

  const doSearch = async (ko: number, p: string) => {
    bld.clear(); setManager(null); setManagerGeom(null);
    const found = await sel.search(ko, p);
    if (found) {
      setParams({ ko: String(found.koId), p: found.number }, { replace: true });
      setFitKey((k) => k + 1);
    }
  };

  // deep link: /?ko=657&p=1587
  useEffect(() => {
    if (manager) return;
    if (initialKo && initialBuilding) void showBuilding(initialKo, Number(initialBuilding));
    else if (initialKo && initialParcel) void doSearch(initialKo, initialParcel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onAddress = async (a: Address) => {
    bld.clear();
    const found = await sel.pickAddress(a.e, a.n);
    if (found) {
      setParams({ ko: String(found.koId), p: found.number }, { replace: true });
      setFitKey((k) => k + 1);
    }
  };

  const onMapClick = async (lon: number, lat: number) => {
    if (draw && !draw.done) { setDraw((d) => (d && !d.done ? { ...d, points: [...d.points, [lon, lat]] } : d)); return; }
    if (draw) return;
    if (zoom < CLICK_MIN_ZOOM) return;
    if (zoom >= BUILDING_CLICK_ZOOM && overlays.buildings) {
      const b = await bld.pick(lon, lat);
      if (b) {
        sel.clear();
        setParams({ ko: String(b.koId), st: String(b.number) }, { replace: true });
        return;
      }
    }
    bld.clear();
    const found = await sel.pick(lon, lat);
    if (found) setParams({ ko: String(found.koId), p: found.number }, { replace: true });
  };

  const close = () => { sel.clear(); bld.clear(); setManager(null); setManagerGeom(null); setParams({}, { replace: true }); };

  const openCartItem = (i: CartItem) => {
    setCartOpen(false);
    if (i.kind === "parcel") { setMode("parcel"); void doSearch(i.koId, i.number); }
    else { setMode("building"); void showBuilding(i.koId, Number(i.number)); }
  };

  const openResult = (r: ResultRecord) => {
    const p = r.extract.property;
    if (!p.koId || !p.number) return;
    setResultsOpen(false);
    if (p.type === "parcel") { setMode("parcel"); void doSearch(p.koId, p.number); }
    else { setMode("building"); void showBuilding(p.koId, Number(p.number)); }
  };

  const toggle = (id: OverlayId) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setOverlays((o) => ({ ...o, [id]: e.currentTarget.checked }));

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <MapView
        basemap={basemap} overlays={overlays} labels={labels} dark={scheme === "dark"} onZoom={setZoom}
        selection={bld.building?.geometry ?? sel.parcel?.geometry ?? (manager ? managerGeom : null)} fitKey={fitKey} onMapClick={onMapClick} cart={cartFc} draft={draw?.points ?? null}
        results={manager ? managerPts : null} areaResults={draw?.done ? areaFc : null} onResultClick={(ko, n) => void showBuilding(ko, n, true)}
      />

      <Paper shadow="md" radius="md" p={6} style={{ position: "absolute", top: 12, left: 12, right: 60, maxWidth: 640, zIndex: 4 }}>
        <Group gap={8} wrap="nowrap">
          <Title order={1} size="h5" c="teal.8" visibleFrom="sm" style={{ whiteSpace: "nowrap", paddingLeft: 6 }}>iKataster</Title>
          {mode === "parcel" && <ParcelSearch kos={kos} loading={sel.loading} initialKo={initialKo} initialParcel={initialParcel} onSearch={doSearch} />}
          {mode === "building" && <ParcelSearch kind="building" kos={kos} loading={bld.loading} initialKo={initialKo} initialParcel={initialBuilding} onSearch={(ko, st) => { const n = Number(st); if (Number.isInteger(n) && n > 0) void showBuilding(ko, n); }} />}
          {mode === "address" && <AddressSearch client={gurs} onSelect={onAddress} />}
          {mode === "manager" && <ManagerSearch client={gurs} onSelect={(m) => openManager(m.id)} />}
        </Group>
        <SegmentedControl
          size="xs" mt={6} value={mode} onChange={(v) => setMode(v as Mode)}
          data={[{ value: "address", label: t("modeAddress") }, { value: "parcel", label: t("modeParcel") }, { value: "building", label: t("modeBuilding") }, { value: "manager", label: t("modeManager") }]}
        />
        {bld.error && (
          <Alert mt={6} color="red" variant="light" withCloseButton onClose={bld.dismissError} p="xs" role="alert">
            {t(bld.error)}
          </Alert>
        )}
        {sel.error && (
          <Alert mt={6} color="red" variant="light" withCloseButton onClose={sel.dismissError} p="xs" role="alert">
            {t(sel.error)}
          </Alert>
        )}
        {!sel.parcel && !bld.building && !manager && !sel.error && zoom >= CLICK_MIN_ZOOM && (
          <Text size="xs" c="dimmed" mt={4} ml={6}>{t("clickHint")}</Text>
        )}
      </Paper>

      {draw && !draw.done && (
        <Paper shadow="lg" radius="md" p="sm" data-testid="draw-toolbar" style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", bottom: 24, zIndex: 5, maxWidth: "calc(100vw - 24px)" }}>
          <Text size="xs" c="dimmed" ta="center" mb={6}>{t("drawHint")} · {t("points")}: {draw.points.length}</Text>
          <Group gap={6} justify="center" wrap="nowrap">
            <Button size="xs" variant="default" disabled={!draw.points.length} onClick={() => setDraw((d) => d && { ...d, points: d.points.slice(0, -1) })}>{t("undo")}</Button>
            <Button size="xs" variant="default" onClick={() => setDraw(null)}>{t("cancel")}</Button>
            <Button size="xs" color="blue" disabled={draw.points.length < 3} onClick={() => setDraw({ ...draw, done: true })}>{t("finish")}</Button>
          </Group>
        </Paper>
      )}
      {draw?.done
        ? <AreaPanel client={gurs} ring={draw.points} kos={kos} onRedraw={startDraw} onClose={() => setDraw(null)} onHighlight={setAreaFc} />
        : <>
          {manager && (
            <div style={{ display: bld.building ? "none" : undefined }} data-testid="manager-host">
              <ManagerPanel
                client={gurs} managerId={manager.id} kos={kos} koFilter={manager.ko}
                onKoFilter={(ko) => openManager(manager.id, ko)} onClose={close}
                onOpenBuilding={(ko, n) => void showBuilding(ko, n, true)} onHighlight={onManagerHighlight}
              />
            </div>
          )}
          {bld.building
            ? <BuildingPanel
                building={bld.building} parts={bld.parts} partsError={bld.partsError}
                onClose={manager ? backToManager : close} onBack={manager ? backToManager : undefined}
                onManager={(id) => (manager?.id === id ? backToManager() : openManager(id, bld.building!.koId))}
              />
            : !manager && sel.parcel && <ParcelPanel parcel={sel.parcel} details={sel.details} onClose={close} onBuilding={(n) => void showBuilding(sel.parcel!.koId, n)} />}
        </>}

      <CartDrawer opened={cartOpen} onClose={() => setCartOpen(false)} onOpenItem={openCartItem} onImport={() => { setCartOpen(false); setImportOpen(true); }} />
      <ResultsModal opened={resultsOpen} onClose={() => setResultsOpen(false)} onOpenProperty={openResult} />
      <InstallHint />
      <UpdateToast />
      <DataModal opened={dataOpen} onClose={() => setDataOpen(false)} />
      <ImportModal opened={importOpen} onClose={() => setImportOpen(false)} client={gurs} kos={kos} />

      <Stack gap={8} style={{ position: "absolute", top: 12, right: 12, zIndex: 4 }}>
        <Tooltip label={t("drawArea")} position="left">
          <ActionIcon size="lg" variant={draw ? "filled" : "default"} radius="md" aria-label={t("drawArea")} onClick={() => (draw ? setDraw(null) : startDraw())}>
            <IconPolygon size={18} />
          </ActionIcon>
        </Tooltip>
        <div style={{ position: "relative" }}>
          <ActionIcon size="lg" variant="default" radius="md" aria-label={`${t("results")} (${results.records.length})`} onClick={() => setResultsOpen(true)}>
            <IconUsers size={18} />
          </ActionIcon>
          {results.records.length > 0 && (
            <Badge size="xs" circle color="teal" style={{ position: "absolute", top: -6, right: -6, pointerEvents: "none" }}>
              {results.records.length > 99 ? "99+" : results.records.length}
            </Badge>
          )}
        </div>
        <div style={{ position: "relative" }}>
          <ActionIcon size="lg" variant="default" radius="md" aria-label={`${t("cart")} (${cart.items.length})`} onClick={() => setCartOpen(true)}>
            <IconFileText size={18} />
          </ActionIcon>
          {cart.items.length > 0 && (
            <Badge size="xs" circle color="orange" data-testid="cart-count" style={{ position: "absolute", top: -6, right: -6, pointerEvents: "none" }}>
              {cart.items.length > 99 ? "99+" : cart.items.length}
            </Badge>
          )}
        </div>
        <Popover position="left-start" shadow="md" radius="md" withArrow>
          <Popover.Target>
            <ActionIcon size="lg" variant="default" radius="md" aria-label={t("layers")}>
              <IconStack2 size={18} />
            </ActionIcon>
          </Popover.Target>
          <Popover.Dropdown>
            <Stack gap="xs" w={220}>
              <Text size="xs" fw={700} c="dimmed" tt="uppercase">{t("basemap")}</Text>
              <SegmentedControl
                fullWidth size="xs" value={basemap} onChange={(v) => setBasemap(v as BasemapId)}
                data={[{ value: "street", label: t("street") }, { value: "ortho", label: t("ortho") }]}
              />
              <Switch mt={6} label={t("labels")} checked={labels} onChange={(e) => setLabels(e.currentTarget.checked)} />
              <Text size="xs" fw={700} c="dimmed" tt="uppercase" mt={4}>{t("overlays")}</Text>
              <Switch label={t("parcels")} checked={overlays.parcels} onChange={toggle("parcels")} />
              {overlays.parcels && zoom < 15 && <Text size="xs" c="dimmed">{t("zoomHintParcels")}</Text>}
              <Switch label={t("buildings")} checked={overlays.buildings} onChange={toggle("buildings")} />
              {overlays.buildings && zoom < 17 && <Text size="xs" c="dimmed">{t("zoomHintBuildings")}</Text>}
            </Stack>
          </Popover.Dropdown>
        </Popover>
        <Tooltip label={t("data")} position="left">
          <ActionIcon size="lg" variant="default" radius="md" aria-label={t("data")} onClick={() => setDataOpen(true)}>
            <IconDatabase size={18} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t("theme")} position="left">
          <ActionIcon size="lg" variant="default" radius="md" aria-label={t("theme")}
            onClick={() => setColorScheme(scheme === "dark" ? "light" : "dark")}>
            {scheme === "dark" ? <IconSun size={18} /> : <IconMoon size={18} />}
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t("language")} position="left">
          <ActionIcon size="lg" variant="default" radius="md" aria-label={t("language")}
            onClick={() => setLang(lang === "sl" ? "en" : "sl")}>
            <Group gap={0}><IconLanguage size={14} /><Text size="10px" fw={700}>{lang.toUpperCase()}</Text></Group>
          </ActionIcon>
        </Tooltip>
      </Stack>
    </div>
  );
}
