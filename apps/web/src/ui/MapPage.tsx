import { useMediaQuery } from "@mantine/hooks";
import { MoreActions } from "./MoreActions";
import { OrthoYearBar } from "./OrthoYearBar";
import { SETTINGS } from "../data/inventory";
import { useSelection, type Mode } from "../selection/useSelection";
import { useEffect, useMemo, useRef, useState } from "react";
import { findElsewhere, type CrossHint, type SearchTab } from "../search/crossHint";
import {
  ActionIcon, Alert, Badge, Button, Group, Paper, Popover, SegmentedControl, Stack, Switch, Text, Title, Tooltip,
  useComputedColorScheme, useMantineColorScheme,
} from "@mantine/core";
import { IconDatabase, IconLanguage, IconMoon, IconPolygon, IconFileText, IconStack2, IconSun, IconBrandGithub, IconHelp } from "@tabler/icons-react";
import { ExtractsModal, type ExtractsTab } from "../ezk/ExtractsModal";
import { useResults } from "../ezk/useResults";
import { useResultPoints } from "../ezk/points";
import type { ResultRecord } from "../ezk/results";
import { MapView } from "../map/MapView";
import { useCadastre } from "../map/useCadastre";
import type { BasemapId, OverlayId } from "../map/layers";
import { orthoAvailable } from "../map/orthoProbe";
import { useI18n } from "../i18n";
import { useGurs } from "../gurs/instance";
import { useKos } from "../gurs/useKos";
import { ParcelSearch } from "../features/parcel/ParcelSearch";
import { AddressSearch } from "../features/parcel/AddressSearch";
import { ParcelPanel } from "../features/parcel/ParcelPanel";
import { BuildingPanel } from "../features/building/BuildingPanel";
import { useCart } from "../cart/useCart";
import type { CartItem } from "../cart/store";
import type { FeatureCollection } from "geojson";
import { AreaPanel } from "../features/area/AreaPanel";
import { ImportModal } from "../import/ImportModal";
import { HelpModal } from "./HelpModal";
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
export const BASEMAP_KEY = SETTINGS.basemap;
/** Show downloaded land-registry extracts on the map. */
export const EZK_LAYER_KEY = SETTINGS.ezkLayer;

export function MapPage() {
  const { t, lang, setLang } = useI18n();
  const mobile = useMediaQuery("(max-width: 640px)");
  const { setColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme("light");
  const gurs = useGurs();
  const offline = useOffline();
  // Stale pinned KOs refresh in the background once per app open.
  useEffect(() => { void refreshStale(gurs, offline, pinMaxAgeDays()).catch(() => undefined); }, [gurs, offline]);
  const { kos } = useKos(gurs);
  const cart = useCart();
  const [extractsOpen, setExtractsOpen] = useState(false);
  const [extractsTab, setExtractsTab] = useState<ExtractsTab>("todo");
  const results = useResults();
  const [importOpen, setImportOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const cartFc = useMemo<FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: cart.items.filter((i) => i.geometry).map((i) => ({ type: "Feature", properties: { key: i.key }, geometry: i.geometry! })),
  }), [cart.items]);
  const [basemap, setBasemapState] = useState<BasemapId>(() => (localStorage.getItem(BASEMAP_KEY) === "ortho" ? "ortho" : "street"));
  const setBasemap = (b: BasemapId) => { setBasemapState(b); try { localStorage.setItem(BASEMAP_KEY, b); } catch { /* private mode */ } };
  const cadastre = useCadastre();
  // GURS orthophoto is often blocked outside Slovenia: fall back to the street map (preference kept for next visit).
  const [orthoDown, setOrthoDown] = useState(false);
  useEffect(() => {
    if (basemap !== "ortho" || import.meta.env.MODE === "test") return;
    let live = true;
    void orthoAvailable().then((ok) => { if (live && !ok) setOrthoDown(true); });
    return () => { live = false; };
  }, [basemap]);
  const shownBasemap: BasemapId = orthoDown ? "street" : basemap;
  const [overlays, setOverlays] = useState<Record<OverlayId, boolean>>({ parcels: true, buildings: true });
  const [labels, setLabels] = useState(true);
  const [orthoYear, setOrthoYear] = useState<number | null>(null);
  const [zoom, setZoom] = useState(0);
  const { openProperty, sel, bld, draw, setDraw, startDraw, mode, setMode, manager, managerGeom, managerPts,
    fitKey, initialKo, initialParcel, initialBuilding, openManager, onManagerHighlight,
    showBuilding, backToManager, doSearch, onAddress, onMapClick, close } = useSelection(gurs, zoom, overlays.buildings);
  const [areaFc, setAreaFc] = useState<FeatureCollection | null>(null);

  // "Found in another tab" hint: when a search finds nothing, look for the same text as another kind.
  const lastProp = useRef(initialKo && (initialParcel ?? initialBuilding) ? `${initialKo} ${initialParcel ?? initialBuilding}` : "");
  const [missed, setMissed] = useState<{ tab: SearchTab; text: string } | null>(null);
  const [hint, setHint] = useState<CrossHint | null>(null);
  useEffect(() => {
    if (sel.error === "notFound" && mode === "parcel") setMissed({ tab: "parcel", text: lastProp.current });
    else if (bld.error === "buildingNotFound" && mode === "building") setMissed({ tab: "building", text: lastProp.current });
  }, [sel.error, bld.error, mode]);
  useEffect(() => { setMissed(null); }, [mode]);
  useEffect(() => {
    setHint(null);
    if (!missed) return;
    const c = new AbortController();
    void findElsewhere(missed.tab, missed.text, gurs, kos, c.signal).then((h) => { if (!c.signal.aborted) setHint(h); });
    return () => c.abort();
  }, [missed, gurs, kos]);
  const hintLabel = (h: CrossHint) =>
    h.kind === "parcel" ? `${t("parcel").toLowerCase()} ${t("ko")} ${h.koId} ${h.koName} ${h.number}`
      : h.kind === "building" ? `${t("building").toLowerCase()} ${t("ko")} ${h.koId} ${h.koName} ${h.number}`
        : h.kind === "address" ? `${t("modeAddress").toLowerCase()} ${h.address.label}, ${h.address.place}`
          : `${t("modeManager").toLowerCase()} ${h.manager.name}`;
  const hintBox = hint && (
    <Group gap={8} justify="space-between" wrap="nowrap" mt={6} data-testid="cross-hint" style={{ textAlign: "left" }}>
      <Text size="sm" c="var(--mantine-color-text)" style={{ minWidth: 0, flex: 1 }}>{t("foundAs")} <b>{hintLabel(hint)}</b></Text>
      <Button size="compact-sm" style={{ flexShrink: 0 }} onMouseDown={(e) => e.preventDefault()} onClick={() => openHint(hint)}>{t("open")}</Button>
    </Group>
  );
  const openHint = (h: CrossHint) => {
    setMissed(null);
    if (h.kind === "parcel") { sel.dismissError(); setMode("parcel"); doSearch(h.koId, h.number); }
    else if (h.kind === "building") { bld.dismissError(); setMode("building"); void showBuilding(h.koId, h.number); }
    else if (h.kind === "address") { setMode("address"); onAddress(h.address); }
    else { setMode("manager"); openManager(h.manager.id); }
  };

  const openCartItem = (i: CartItem) => {
    setExtractsOpen(false);
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
    setExtractsOpen(false);
    if (p.type !== "other") void openProperty(p.type, p.koId, p.number);
  };

  const toggle = (id: OverlayId) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setOverlays((o) => ({ ...o, [id]: e.currentTarget.checked }));

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <MapView
        basemap={shownBasemap} overlays={overlays} labels={labels} orthoYear={orthoYear} cadastre={cadastre} dark={scheme === "dark"} onZoom={setZoom}
        selection={bld.building?.geometry ?? sel.parcel?.geometry ?? (manager ? managerGeom : null)} fitKey={fitKey} onMapClick={onMapClick} cart={cartFc} draft={draw?.points ?? null}
        results={manager ? managerPts : null} areaResults={draw?.done ? areaFc : null} onResultClick={(ko, n) => void showBuilding(ko, n, true)}
        ezk={ezkPts} onEzkClick={openEzk}
      />

      {shownBasemap === "ortho" && orthoYear !== null && (
        <OrthoYearBar year={orthoYear} onChange={setOrthoYear} onClose={() => setOrthoYear(null)} />
      )}

      <Paper shadow="md" radius="md" p={6} style={{ position: "absolute", top: 12, left: 12, right: 60, maxWidth: 640, zIndex: 4 }}>
        <Group gap={8} wrap="nowrap">
          <Title order={1} size="h5" c="teal.8" visibleFrom="sm" style={{ whiteSpace: "nowrap", paddingLeft: 6 }}>iKataster</Title>
          {mode === "parcel" && <ParcelSearch kos={kos} loading={sel.loading} initialKo={initialKo} initialParcel={initialParcel} onSearch={(ko, p) => { lastProp.current = `${ko} ${p}`; doSearch(ko, p); }} />}
          {mode === "building" && <ParcelSearch kind="building" kos={kos} loading={bld.loading} initialKo={initialKo} initialParcel={initialBuilding} onSearch={(ko, st) => { lastProp.current = `${ko} ${st}`; const n = Number(st); if (Number.isInteger(n) && n > 0) void showBuilding(ko, n); }} />}
          {mode === "address" && <AddressSearch client={gurs} onSelect={onAddress} onMiss={(q) => setMissed(q ? { tab: "address", text: q } : null)} missExtra={hint && hintBox} />}
          {mode === "manager" && <ManagerSearch client={gurs} onSelect={(m) => openManager(m.id)} onMiss={(q) => setMissed(q ? { tab: "manager", text: q } : null)} missExtra={hint && hintBox} />}
        </Group>
        <SegmentedControl
          size="xs" mt={6} value={mode} onChange={(v) => setMode(v as Mode)}
          data={[{ value: "address", label: t("modeAddress") }, { value: "parcel", label: t("modeParcel") }, { value: "building", label: t("modeBuilding") }, { value: "manager", label: t("modeManager") }]}
        />
        {hint && (mode === "parcel" || mode === "building") && (
          <Alert mt={6} color="blue" variant="light" p="xs" withCloseButton onClose={() => setMissed(null)}>{hintBox}</Alert>
        )}
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

      <ExtractsModal opened={extractsOpen} tab={extractsTab} onTab={setExtractsTab} onClose={() => setExtractsOpen(false)}
        onOpenItem={openCartItem} onImport={() => { setExtractsOpen(false); setImportOpen(true); }} onOpenProperty={openResult} />
      <InstallHint />
      <UpdateToast />
      <DataModal opened={dataOpen} onClose={() => setDataOpen(false)} />
      <ImportModal opened={importOpen} onClose={() => setImportOpen(false)} client={gurs} kos={kos} />
      <HelpModal opened={helpOpen} onClose={() => setHelpOpen(false)} />

      <Stack gap={8} style={{ position: "absolute", top: 12, right: 12, zIndex: 4 }}>
        {!mobile && <Tooltip label={t("drawArea")} position="left">
          <ActionIcon size="lg" variant={draw ? "filled" : "default"} radius="md" aria-label={t("drawArea")} onClick={() => (draw ? setDraw(null) : startDraw())}>
            <IconPolygon size={18} />
          </ActionIcon>
        </Tooltip>}
        <div style={{ position: "relative" }}>
          <ActionIcon size="lg" variant="default" radius="md" aria-label={`${t("extractsTitle")} (${cart.items.length}/${results.records.length})`}
            onClick={() => { setExtractsTab(cart.items.length > 0 || results.records.length === 0 ? "todo" : "done"); setExtractsOpen(true); }}>
            <IconFileText size={18} />
          </ActionIcon>
          {cart.items.length > 0 ? (
            <Badge size="xs" circle color="orange" data-testid="cart-count" style={{ position: "absolute", top: -6, right: -6, pointerEvents: "none" }}>
              {cart.items.length > 99 ? "99+" : cart.items.length}
            </Badge>
          ) : results.records.length > 0 && (
            <Badge size="xs" circle color="teal" data-testid="results-count" style={{ position: "absolute", top: -6, right: -6, pointerEvents: "none" }}>
              {results.records.length > 99 ? "99+" : results.records.length}
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
              {basemap === "ortho" && orthoDown && <Text size="xs" c="orange.8" maw={240} data-testid="ortho-down">{t("orthoDown")}</Text>}
              {shownBasemap === "ortho" && (
                <Switch label={t("orthoHistory")} checked={orthoYear !== null} onChange={(e) => setOrthoYear(e.currentTarget.checked ? 2011 : null)} />
              )}
              <Switch mt={6} label={t("labels")} checked={labels} onChange={(e) => setLabels(e.currentTarget.checked)} />
              <Text size="xs" fw={700} c="dimmed" tt="uppercase" mt={4}>{t("overlays")}</Text>
              {cadastre === "mirror" && <Text size="xs" c="dimmed" maw={240} data-testid="cadastre-mirror">{t("cadastreMirror")}</Text>}
              <Switch label={t("parcels")} checked={overlays.parcels} onChange={toggle("parcels")} />
              {overlays.parcels && zoom < 15 && <Text size="xs" c="dimmed">{t("zoomHintParcels")}</Text>}
              <Switch label={t("buildings")} checked={overlays.buildings} onChange={toggle("buildings")} />
              {overlays.buildings && zoom < 17 && <Text size="xs" c="dimmed">{t("zoomHintBuildings")}</Text>}
              <Switch label={t("ezkLayer")} checked={ezkLayer} onChange={(e) => setEzkLayer(e.currentTarget.checked)} />
            </Stack>
          </Popover.Dropdown>
        </Popover>
        {mobile ? <MoreActions actions={[
          { label: t("help"), icon: <IconHelp size={18} />, onClick: () => setHelpOpen(true) },
          { label: t("data"), icon: <IconDatabase size={18} />, onClick: () => setDataOpen(true) },
          { label: draw ? t("cancelDrawing") : t("drawArea"), icon: <IconPolygon size={18} />, active: !!draw, onClick: () => draw ? setDraw(null) : startDraw() },
          { label: t("theme"), icon: scheme === "dark" ? <IconSun size={18} /> : <IconMoon size={18} />, onClick: () => setColorScheme(scheme === "dark" ? "light" : "dark") },
          { label: `${t("language")} · ${lang === "sl" ? "English" : "Slovenščina"}`, icon: <IconLanguage size={18} />, onClick: () => setLang(lang === "sl" ? "en" : "sl") },
          { label: "GitHub", icon: <IconBrandGithub size={18} />, href: "https://github.com/ibracic/ikataster" },
        ]} /> : <>
        <Tooltip label={t("help")} position="left">
          <ActionIcon size="lg" variant="default" radius="md" aria-label={t("help")} onClick={() => setHelpOpen(true)}>
            <IconHelp size={18} />
          </ActionIcon>
        </Tooltip>
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
        </>}
      </Stack>
    </div>
  );
}
