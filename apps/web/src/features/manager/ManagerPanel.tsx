import { useEffect, useMemo, useState } from "react";
import { PanelWideToggle } from "../../ui/PanelWide";
import { Alert, Button, CloseButton, Group, Loader, Paper, Progress, ScrollArea, Select, Stack, Text, Title, UnstyledButton } from "@mantine/core";
import { IconCheck, IconRefresh, IconFilePlus } from "@tabler/icons-react";
import { cacheStore } from "../../cache/instance";
import { cacheKeys } from "../../cache/withCache";
import { ageText } from "../../sw/cacheStatus";
import { bboxOf } from "../../local/db";
import type { Feature, FeatureCollection, Point, Geometry, MultiPolygon, Polygon } from "geojson";
import type { GursClient, Ko, ManagerPortfolio } from "../../gurs";
import { useI18n } from "../../i18n";
import { itemKey, type CartInput } from "../../cart/store";
import { useCart } from "../../cart/useCart";
import { errorMessageKey } from "../parcel/errorMessage";
import { SheetHandle, SheetSummary, useSheet } from "../../ui/Sheet";

/** Buildings drawn/outlined at once; above this pick a KO first. */
export const OUTLINE_MAX = 300;

interface Props {
  client: GursClient;
  managerId: number;
  kos: Ko[];
  koFilter: number | null;
  onKoFilter: (ko: number | null) => void;
  onClose: () => void;
  onOpenBuilding: (ko: number, number: number) => void;
  /** Outlines of the visible buildings, merged, for highlight + fit. */
  onHighlight: (g: Geometry | null, points?: FeatureCollection<Point> | null) => void;
}

/** One map marker per building (centre of its outline), labelled with the part count. */
export function resultPoints(bs: { koId: number; number: number; parts: unknown[] }[], outlines: Map<string, Geometry>): FeatureCollection<Point> {
  const features: Feature<Point>[] = [];
  for (const b of bs) {
    const g = outlines.get(`${b.koId}:${b.number}`);
    if (!g) continue;
    const [w, s, e, n] = bboxOf(g);
    if (!Number.isFinite(w)) continue;
    features.push({ type: "Feature", properties: { ko: b.koId, n: b.number, parts: b.parts.length }, geometry: { type: "Point", coordinates: [(w + e) / 2, (s + n) / 2] } });
  }
  return { type: "FeatureCollection", features };
}

export function mergePolygons(gs: Geometry[]): MultiPolygon | null {
  const coords = gs.flatMap((g) => (g.type === "Polygon" ? [(g as Polygon).coordinates] : g.type === "MultiPolygon" ? (g as MultiPolygon).coordinates : []));
  return coords.length ? { type: "MultiPolygon", coordinates: coords } : null;
}

export function ManagerPanel({ client, managerId, kos, koFilter, onKoFilter, onClose, onOpenBuilding, onHighlight }: Props) {
  const { t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "sl" ? "sl-SI" : "en-GB");
  const { store, keys } = useCart();
  const [data, setData] = useState<ManagerPortfolio | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number | null }>({ done: 0, total: null });
  const [err, setErr] = useState<ReturnType<typeof errorMessageKey> | "managerNotFound" | null>(null);
  const [outlines, setOutlines] = useState<Map<string, Geometry>>(new Map());
  const [added, setAdded] = useState<number | null>(null);
  const [reload, setReload] = useState(0);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const sheet = useSheet(`upr-${managerId}`);
  const koName = useMemo(() => new Map(kos.map((k) => [k.id, k.name])), [kos]);

  useEffect(() => {
    const ctl = new AbortController();
    setData(null); setErr(null); setAdded(null); setProgress({ done: 0, total: null });
    client.managerPortfolio(managerId, { signal: ctl.signal, onProgress: (n) => setProgress((p) => ({ ...p, done: n })) })
      .then(async (p) => {
        if (ctl.signal.aborted) return;
        if (p) setData(p); else setErr("managerNotFound");
        const hit = await cacheStore.get(cacheKeys.portfolio(managerId)).catch(() => undefined);
        if (!ctl.signal.aborted) setSavedAt(hit?.at ?? null);
      })
      .catch((e) => { if (!ctl.signal.aborted && (e as Error)?.name !== "AbortError") setErr(errorMessageKey(e)); });
    return () => ctl.abort();
  }, [client, managerId, reload]);
  const refresh = async () => { await cacheStore.delete(cacheKeys.portfolio(managerId)).catch(() => undefined); setSavedAt(null); setReload((r) => r + 1); };

  const byKo = useMemo(() => {
    const m = new Map<number, { buildings: number; parts: number }>();
    for (const b of data?.buildings ?? []) { const x = m.get(b.koId) ?? { buildings: 0, parts: 0 }; x.buildings++; x.parts += b.parts.length; m.set(b.koId, x); }
    return [...m.entries()].sort((a, b) => b[1].parts - a[1].parts);
  }, [data]);
  const visible = useMemo(() => (data?.buildings ?? []).filter((b) => !koFilter || b.koId === koFilter), [data, koFilter]);
  const tooMany = visible.length > OUTLINE_MAX;

  useEffect(() => {
    if (!visible.length || tooMany) { onHighlight(null); return; }
    const ctl = new AbortController();
    const missing = visible.filter((b) => !outlines.has(`${b.koId}:${b.number}`));
    const done = (m: Map<string, Geometry>) => onHighlight(
      mergePolygons(visible.map((b) => m.get(`${b.koId}:${b.number}`)).filter((g): g is Geometry => !!g)),
      resultPoints(visible, m));
    if (!missing.length) { done(outlines); return; }
    client.buildingOutlines(missing.map((b) => ({ koId: b.koId, number: b.number })), ctl.signal)
      .then((g) => { if (ctl.signal.aborted) return; const m = new Map([...outlines, ...g]); setOutlines(m); done(m); })
      .catch(() => { /* outlines are cosmetic; list still works */ });
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, tooMany]);
  useEffect(() => () => onHighlight(null), [onHighlight]);

  const name = (ko: number) => koName.get(ko) ?? "";
  const buildingItems: CartInput[] = visible.map((b) => ({ kind: "building", koId: b.koId, koName: name(b.koId), number: String(b.number), eid: b.eid, geometry: outlines.get(`${b.koId}:${b.number}`) ?? null }));
  const partItems: CartInput[] = visible.flatMap((b) => b.parts.map((p) => ({
    kind: "part" as const, koId: b.koId, koName: name(b.koId), number: String(b.number), part: p.part, eid: p.eid,
    geometry: outlines.get(`${b.koId}:${b.number}`) ?? null, note: p.use ?? undefined,
  })));
  const fresh = (xs: CartInput[]) => xs.filter((i) => !keys.has(itemKey(i))).length;
  const add = async (xs: CartInput[]) => setAdded(await store.add(xs));
  const partsVisible = partItems.length;

  return (
    <Paper shadow="lg" radius="md" p="md" className="parcel-panel" data-testid="manager-panel" {...sheet.attr}>
      <SheetHandle open={sheet.open} setOpen={sheet.setOpen} />
      <Group justify="space-between" align="flex-start" wrap="nowrap" mb="xs">
        <div style={{ minWidth: 0 }}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>{t("manager")}</Text>
          <Title order={2} size="h4" className="sheet-title">{data?.manager.name ?? "…"}</Title>
          {data?.manager.address && <Text size="sm" c="dimmed">{data.manager.address}</Text>}
        </div>
        <Group gap={2} wrap="nowrap"><PanelWideToggle /><CloseButton aria-label={t("close")} onClick={onClose} /></Group>
      </Group>

      {err ? (
        <Alert color={err === "managerNotFound" ? "orange" : "red"} variant="light" p="xs" role="alert">{t(err)}</Alert>
      ) : !data ? (
        <Stack gap={6} data-testid="manager-loading">
          <Group gap={8}><Loader size="xs" /><Text size="sm">{t("managerLoading")} {progress.done ? `(${nf.format(progress.done)})` : ""}</Text></Group>
          <Progress value={100} animated striped size="sm" />
        </Stack>
      ) : (
        <>
          <SheetSummary>
            <Text size="sm" data-testid="sheet-summary" onClick={() => sheet.setOpen(true)} style={{ cursor: "pointer" }}>
              {nf.format(data.buildings.length)} {t("managerBuildings")} · {nf.format(data.parts.length)} {t("managerParts")} · {byKo.length} KO
            </Text>
          </SheetSummary>
          <div className="sheet-body">
            <Text size="sm" mb={6} data-testid="manager-totals">
              {nf.format(data.buildings.length)} {t("managerBuildings")} · {nf.format(data.parts.length)} {t("managerParts")} · {byKo.length} KO
            </Text>
            {savedAt != null && (
              <Group gap={6} mb={6} data-testid="manager-saved">
                <Text size="xs" c="dimmed">{t("savedLocally")} · {ageText(savedAt, Date.now(), lang)}</Text>
                <Button size="compact-xs" variant="subtle" leftSection={<IconRefresh size={12} />} onClick={() => void refresh()}>{t("refresh")}</Button>
              </Group>
            )}
            <Select
              size="xs" mb="xs" clearable searchable placeholder={t("managerAllKos")} aria-label={t("ko")}
              value={koFilter ? String(koFilter) : null} onChange={(v) => { setAdded(null); onKoFilter(v ? Number(v) : null); }}
              data={byKo.map(([ko, x]) => ({ value: String(ko), label: `${ko} ${name(ko)} (${x.buildings} / ${x.parts})` }))}
              comboboxProps={{ withinPortal: true }}
            />
            {tooMany && <Alert color="blue" variant="light" p="xs" mb="xs"><Text size="xs">{t("managerPickKo")}</Text></Alert>}
            <ScrollArea.Autosize mah="min(40vh, 380px)" type="auto" scrollbars="y" offsetScrollbars="y">
              <Stack gap={2} data-testid="manager-buildings">
                {byKo.filter(([ko]) => !koFilter || ko === koFilter).map(([ko, x]) => (
                  <div key={ko}>
                    <Text size="xs" fw={700} c="dimmed" mt={6}>{ko} {name(ko)} · {x.buildings} {t("managerBuildings")} · {x.parts} {t("managerParts")}</Text>
                    {visible.filter((b) => b.koId === ko).slice(0, 200).map((b) => (
                      <UnstyledButton key={b.eid} onClick={() => onOpenBuilding(b.koId, b.number)} style={{ display: "block", width: "100%", padding: "3px 0" }}>
                        <Group justify="space-between" wrap="nowrap">
                          <Text size="sm">{t("building")} {b.number}</Text>
                          <Text size="xs" c="dimmed">{b.parts.length} {t("managerParts")}</Text>
                        </Group>
                      </UnstyledButton>
                    ))}
                  </div>
                ))}
              </Stack>
            </ScrollArea.Autosize>
          </div>
          {added != null && (
            <Alert color="teal" variant="light" p="xs" mt="xs" icon={<IconCheck size={14} />}>{t("areaAdded")}: {added}</Alert>
          )}
          <Group justify="flex-end" mt="sm" gap={6}>
            <Button size="xs" variant="light" leftSection={<IconFilePlus size={14} />} disabled={!fresh(buildingItems)} onClick={() => void add(buildingItems)}>
              {t("managerAddBuildings")} ({fresh(buildingItems)})
            </Button>
            <Button size="xs" leftSection={<IconFilePlus size={14} />} disabled={!fresh(partItems)} onClick={() => void add(partItems)}>
              {t("managerAddParts")} ({fresh(partItems)}{fresh(partItems) !== partsVisible ? ` / ${partsVisible}` : ""})
            </Button>
          </Group>
        </>
      )}
    </Paper>
  );
}
