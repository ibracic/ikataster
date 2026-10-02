import { useSelection, type Mode } from "../selection/useSelection";
import { useEffect, useMemo, useState } from "react";
import {
  ActionIcon, Alert, Badge, Button, Group, Paper, Popover, SegmentedControl, Stack, Switch, Text, Title, Tooltip,
  useComputedColorScheme, useMantineColorScheme,
} from "@mantine/core";
import { IconDatabase, IconLanguage, IconMoon, IconPolygon, IconFileText, IconStack2, IconSun, IconUsers, IconBrandGithub } from "@tabler/icons-react";
import { ResultsModal } from "../ezk/ResultsModal";
import { useResults } from "../ezk/useResults";
import { useResultPoints } from "../ezk/points";
import type { ResultRecord } from "../ezk/results";
import { MapView } from "../map/MapView";
import type { BasemapId, OverlayId } from "../map/layers";
import { useI18n } from "../i18n";
import { useGurs } from "../gurs/instance";
import { useKos } from "../gurs/useKos";
import { ParcelSearch } from "../features/parcel/ParcelSearch";
import { AddressSearch } from "../features/parcel/AddressSearch";
import { ParcelPanel } from "../features/parcel/ParcelPanel";
import { BuildingPanel } from "../features/building/BuildingPanel";
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
import "./app.css";

/** Parcels are only clickable once they are drawn (GURS WMS min zoom). */
const CLICK_MIN_ZOOM = 15;


/** Remembered basemap (street map or orthophoto). */
export const BASEMAP_KEY = "ikataster.basemap";
/** Show downloaded land-registry extracts on the map. */
export const EZK_LAYER_KEY = "ikataster.ezkLayer";

export function MapPage() {
  const { t, lang, setLang } = useI18n();
  const { setColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme("light");
  const gurs = useGurs();
  const offline = useOffline();
  // Stale pinned KOs refresh in the background once per app open.
  useEffect(() => { void refreshStale(gurs, offline, pinMaxAgeDays()).catch(() => undefined); }, [gurs, offline]);
  const { kos } = useKos(gurs);
  const cart = useCart();
  const [cartOpen, setCartOpen] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const results = useResults();
  const [importOpen, setImportOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const cartFc = useMemo<FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: cart.items.filter((i) => i.geometry).map((i) => ({ type: "Feature", properties: { key: i.key }, geometry: i.geometry! })),
  }), [cart.items]);
  const [basemap, setBasemapState] = useState<BasemapId>(() => (localStorage.getItem(BASEMAP_KEY) === "ortho" ? "ortho" : "street"));
  const setBasemap = (b: BasemapId) => { setBasemapState(b); try { localStorage.setItem(BASEMAP_KEY, b); } catch { /* private mode */ } };
  const [overlays, setOverlays] = useState<Record<OverlayId, boolean>>({ parcels: true, buildings: true });
  const [labels, setLabels] = useState(true);
  const [zoom, setZoom] = useState(0);
  const { openProperty, sel, bld, draw, setDraw, startDraw, mode, setMode, manager, managerGeom, managerPts,
    fitKey, initialKo, initialParcel, initialBuilding, openManager, onManagerHighlight,
    showBuilding, backToManager, doSearch, onAddress, onMapClick, close } = useSelection(gurs, zoom, overlays.buildings);
  const [areaFc, setAreaFc] = useState<FeatureCollection | null>(null);

  const openCartItem = (i: CartItem) => {
    setCartOpen(false);
    void openProperty(i.kind, i.koId, i.number);
  };

  const [ezkLayer, setEzkLayer] = useState(() => localStorage.getItem(EZK_LAYER_KEY) !== "0");
  useEffect(() => { localStorage.setItem(EZK_LAYER_KEY, ezkLayer ? "1" : "0"); }, [ezkLayer]);
  const ezkPts = useResultPoints(results.records, gurs, ezkLayer);
  const openEzk = (kind: "parcel" | "building", ko: number, n: string) => {
    void openProperty(kind, ko, n);
  };

  const openResult = (r: ResultRecord) => {
    const p = r.extract.property;
    if (!p.koId || !p.number) return;
    setResultsOpen(false);
    if (p.type !== "other") void openProperty(p.type, p.koId, p.number);
  };

  const toggle = (id: OverlayId) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setOverlays((o) => ({ ...o, [id]: e.currentTarget.checked }));

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <MapView
        basemap={basemap} overlays={overlays} labels={labels} dark={scheme === "dark"} onZoom={setZoom}
        selection={bld.building?.geometry ?? sel.parcel?.geometry ?? (manager ? managerGeom : null)} fitKey={fitKey} onMapClick={onMapClick} cart={cartFc} draft={draw?.points ?? null}
        results={manager ? managerPts : null} areaResults={draw?.done ? areaFc : null} onResultClick={(ko, n) => void showBuilding(ko, n, true)}
        ezk={ezkPts} onEzkClick={openEzk}
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
              <Switch label={t("ezkLayer")} checked={ezkLayer} onChange={(e) => setEzkLayer(e.currentTarget.checked)} />
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
        <Tooltip label="GitHub" position="left">
          <ActionIcon component="a" href="https://github.com/ibracic/ikataster" target="_blank" rel="noopener noreferrer" size="lg" variant="default" radius="md" aria-label="GitHub">
            <IconBrandGithub size={18} />
          </ActionIcon>
        </Tooltip>
      </Stack>
    </div>
  );
}
