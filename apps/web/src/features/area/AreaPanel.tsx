import { useEffect, useMemo, useState } from "react";
import { PanelWideToggle } from "../../ui/PanelWide";
import type { Feature, FeatureCollection } from "geojson";
import { Alert, Button, CloseButton, Group, Loader, Paper, SegmentedControl, Text } from "@mantine/core";
import { IconAlertTriangle, IconCheck, IconFilePlus } from "@tabler/icons-react";
import type { AreaKind, AreaResult, GursClient, Ko } from "../../gurs";
import { useI18n } from "../../i18n";
import { itemKey, type CartInput } from "../../cart/store";
import { useCart } from "../../cart/useCart";
import { errorMessageKey } from "../parcel/errorMessage";

/** GURS WFS returns at most 300 features per request; that is our area limit. */
export const AREA_MAX = 300;

interface Props {
  client: GursClient;
  ring: [number, number][];
  kos: Ko[];
  onRedraw: () => void;
  onClose: () => void;
  /** Found features as outlines for the map (null while loading / on close). */
  onHighlight?: (fc: FeatureCollection | null) => void;
}

export function AreaPanel({ client, ring, kos, onRedraw, onClose, onHighlight }: Props) {
  const { t } = useI18n();
  const { store, keys } = useCart();
  const [kind, setKind] = useState<AreaKind>("parcel");
  const [res, setRes] = useState<AreaResult | null>(null);
  const [err, setErr] = useState<ReturnType<typeof errorMessageKey> | null>(null);
  const [added, setAdded] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    setRes(null); setErr(null); setAdded(null);
    client.featuresInPolygon(kind, ring, { max: AREA_MAX })
      .then((r) => { if (live) setRes(r); })
      .catch((e) => { if (live) setErr(errorMessageKey(e)); });
    return () => { live = false; };
  }, [client, kind, ring]);

  const items: CartInput[] = useMemo(() => {
    const names = new Map(kos.map((k) => [k.id, k.name]));
    return (res?.items ?? []).map((i) => ({ ...i, koName: i.koName || names.get(i.koId) || "" }));
  }, [res, kos]);
  useEffect(() => {
    const features: Feature[] = items.filter((i) => i.geometry).map((i) => ({ type: "Feature", properties: { ko: i.koId, n: i.number }, geometry: i.geometry! }));
    onHighlight?.(features.length ? { type: "FeatureCollection", features } : null);
  }, [items, onHighlight]);
  useEffect(() => () => onHighlight?.(null), [onHighlight]);
  const fresh = items.filter((i) => !keys.has(itemKey(i))).length;

  return (
    <Paper shadow="lg" radius="md" p="md" className="parcel-panel" data-testid="area-panel">
      <Group justify="space-between" wrap="nowrap" mb="xs">
        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>{t("areaTitle")}</Text>
        <Group gap={2} wrap="nowrap"><PanelWideToggle /><CloseButton aria-label={t("close")} onClick={onClose} /></Group>
      </Group>
      <SegmentedControl fullWidth size="xs" value={kind} onChange={(v) => setKind(v as AreaKind)}
        data={[{ value: "parcel", label: t("parcels") }, { value: "building", label: t("buildings") }]} />
      <div style={{ minHeight: 56, marginTop: 12 }}>
        {err ? <Alert color="red" variant="light" p="xs" role="alert">{t(err)}</Alert>
          : !res ? <Group gap={8}><Loader size="sm" /><Text size="sm" c="dimmed">GURS…</Text></Group>
          : res.tooMany ? (
            <Alert color="orange" variant="light" p="xs" icon={<IconAlertTriangle size={16} />} role="alert">
              {t("areaTooMany").replace("{total}", String(res.total)).replace("{max}", String(AREA_MAX))}
            </Alert>
          ) : items.length === 0 ? <Text size="sm" c="dimmed">{t("areaNone")}</Text>
          : (
            <Text size="sm" data-testid="area-count">
              {t("areaFound")}: <b>{items.length}</b> {t(kind === "parcel" ? "areaParcels" : "areaBuildings")}
              {fresh !== items.length && <> ({fresh} {t("areaNew")})</>}
            </Text>
          )}
      </div>
      <Group justify="space-between" mt="sm">
        <Button size="xs" variant="subtle" onClick={onRedraw}>{t("redraw")}</Button>
        {added !== null && fresh === 0
          ? <Button size="xs" variant="subtle" color="teal" leftSection={<IconCheck size={14} />} disabled>{t("areaAdded")} ({added})</Button>
          : <Button size="xs" color="teal" leftSection={<IconFilePlus size={14} />} disabled={!fresh}
              onClick={async () => setAdded(await store.add(items))}>{t("areaAdd")} ({fresh})</Button>}
      </Group>
    </Paper>
  );
}
