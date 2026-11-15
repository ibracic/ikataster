import { useEffect, useState } from "react";
import { Button, Group, Text } from "@mantine/core";
import { IconFilePlus } from "@tabler/icons-react";
import { useI18n } from "../i18n";
import { fmt } from "../ezk/QuotaBadge";
import { useCart } from "../cart/useCart";
import { useGurs } from "../gurs/instance";
import type { CartInput } from "../cart/store";

interface Alternatives { parts: CartInput[]; parcels: CartInput[] }

/** For a building that has no LR entry of its own: add its parts or the parcels it stands on (GURS links from the copy). */
export function MissingActions({ item }: { item: CartInput }) {
  const { t } = useI18n();
  const gurs = useGurs();
  const { store: cart } = useCart();
  const [alt, setAlt] = useState<Alternatives | null>(null);
  const [added, setAdded] = useState<number | null>(null);
  const isBuilding = item.kind === "building";
  useEffect(() => {
    if (!isBuilding) return;
    let live = true;
    const n = Number(item.number);
    void Promise.all([gurs.findBuilding(item.koId, n), gurs.buildingParts(item.koId, n), gurs.buildingParcels(item.koId, n)])
      .then(([b, parts, parcels]) => {
        if (!live) return;
        const koName = b?.koName ?? item.koName;
        setAlt({
          parts: parts.map((p) => ({ kind: "part", koId: item.koId, koName, number: item.number, part: p.number, eid: p.eid, geometry: b?.geometry ?? item.geometry, note: p.use ?? undefined })),
          parcels: parcels.map((p) => ({ kind: "parcel", koId: p.koId, koName: p.koName, number: p.number, eid: p.eid, geometry: p.geometry })),
        });
      }).catch(() => undefined);
    return () => { live = false; };
  }, [gurs, item, isBuilding]);
  if (!isBuilding || !alt || (!alt.parts.length && !alt.parcels.length)) return null;
  const add = async (list: CartInput[]) => setAdded(await cart.add(list));
  return <Group gap={4} mt={4} wrap="wrap" data-testid="missing-actions">
    {alt.parts.length > 0 && <Button size="compact-xs" variant="light" leftSection={<IconFilePlus size={12} />} onClick={() => void add(alt.parts)}>
      {fmt(t("queueAddParts"), { n: alt.parts.length })}</Button>}
    {alt.parcels.length > 0 && <Button size="compact-xs" variant="light" leftSection={<IconFilePlus size={12} />} onClick={() => void add(alt.parcels)}>
      {fmt(t("queueAddParcels"), { n: alt.parcels.length })}</Button>}
    {added !== null && <Text size="xs" c="teal">{fmt(t("queueAddedAlt"), { n: added })}</Text>}
  </Group>;
}
