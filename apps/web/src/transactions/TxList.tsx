import { useState } from "react";
import { Badge, Button, Group, Skeleton, Stack, Text } from "@mantine/core";
import { useI18n } from "../i18n";
import { formatEur } from "../values";
import type { KoTxState, TxItem } from ".";

/** GURS ETN "Vrsta dela stavbe / oddanih prostorov" (short labels). */
const PART_TYPE: Record<number, [string, string]> = {
  1: ["hiša", "house"], 2: ["stanovanje", "flat"], 3: ["parkirno mesto", "parking space"], 4: ["garaža", "garage"],
  5: ["pisarna", "office"], 6: ["poslovni prostor", "client premises"], 7: ["zdravstvo", "healthcare"], 8: ["lokal", "shop"],
  9: ["gostinski lokal", "restaurant"], 10: ["šport, kultura", "sport, culture"], 11: ["industrija", "industrial"],
  12: ["turistična nastanitev", "tourist lodging"], 13: ["kmetijski objekt", "farm building"], 14: ["pomožni prostor", "auxiliary"],
  15: ["drugo", "other"], 16: ["soba", "room"],
};
const LAND_TYPE: Record<number, [string, string]> = {
  1: ["stavbno z gradbenim dovoljenjem", "building land with permit"], 2: ["stavbno, komunalno opremljeno", "serviced building land"],
  3: ["stavbno", "building land"], 4: ["za infrastrukturo", "infrastructure land"], 5: ["pod stavbo", "under a building"],
  6: ["cesta, parkirišče", "road, parking"], 7: ["kmetijsko", "agricultural"], 8: ["trajni nasad", "permanent crop"],
  9: ["gozd", "forest"], 10: ["neplodno, vodno", "barren, water"],
};

const fmtDate = (d: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d); return m ? `${+m[3]}. ${+m[2]}. ${m[1]}` : d; };

function Row({ i, land }: { i: TxItem; land?: boolean }) {
  const { t, lang } = useI18n();
  const L = lang === "sl" ? 0 : 1;
  const type = i.type != null ? (land ? LAND_TYPE : PART_TYPE)[i.type]?.[L] : undefined;
  const nf = new Intl.NumberFormat(lang === "sl" ? "sl-SI" : "en-GB", { maximumFractionDigits: 1 });
  const facts = [
    i.part && `${t("txPart")} ${i.part}`, type, i.area ? `${nf.format(i.area)} m²` : null,
    i.share && !/^(\d+)\/\1$/.test(i.share) ? `${t("txShare")} ${i.share}` : null,
  ].filter(Boolean).join(" · ");
  return (
    <Group justify="space-between" wrap="nowrap" gap="xs" align="flex-start" data-testid="tx-row"
      style={{ borderTop: "1px solid var(--mantine-color-default-border)", paddingTop: 4 }}>
      <div style={{ minWidth: 0 }}>
        <Group gap={6} wrap="nowrap">
          <Text size="sm" fw={600}>{fmtDate(i.date)}</Text>
          <Badge size="xs" variant="light" color={i.kind === "rent" ? "grape" : "blue"}>{t(i.kind === "rent" ? "txRent" : "txSale")}</Badge>
          {(i.market === 3 || i.market === 5) && <Badge size="xs" variant="outline" color="gray">{t(i.market === 5 ? "txChecking" : "txNonMarket")}</Badge>}
        </Group>
        {facts && <Text size="xs" c="dimmed">{facts}</Text>}
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <Text size="sm" fw={600}>{i.price != null ? `${formatEur(i.price, lang)}${i.kind === "rent" ? t("txPerMonth") : ""}` : "—"}</Text>
        {i.wholeDeal && i.items > 1 && <Text size="xs" c="dimmed">{t("txWholeDeal").replace("{n}", String(i.items))}</Text>}
        {i.perM2 != null && <Text size="xs" c="dimmed">{nf.format(i.perM2)} €/m²{i.kind === "rent" ? t("txPerMonth") : ""}</Text>}
      </div>
    </Group>
  );
}

export function TxList({ state, items, land, limit = 5 }: { state: KoTxState; items: TxItem[]; land?: boolean; limit?: number }) {
  const { t } = useI18n();
  const [all, setAll] = useState(false);
  if (state.status === "loading") return <Skeleton h={14} w="60%" />;
  if (state.status === "error") return <Text size="xs" c="dimmed">{t("txError")}</Text>;
  if (!items.length) return <Text size="sm" c="dimmed">{t("txNone")}</Text>;
  const shown = all ? items : items.slice(0, limit);
  return (
    <Stack gap={4} data-testid="tx-list">
      {shown.map((i, n) => <Row key={`${i.kind}-${i.deal}-${i.part ?? ""}-${n}`} i={i} land={land} />)}
      {items.length > limit && (
        <Button size="compact-xs" variant="subtle" onClick={() => setAll((v) => !v)} style={{ alignSelf: "flex-start" }}>
          {all ? t("txLess") : `${t("txAll")} (${items.length})`}
        </Button>
      )}
      <Text size="xs" c="dimmed">{t("txSource")}{state.status === "ready" && state.tx?.date ? `, ${fmtDate(state.tx.date)}` : ""}</Text>
    </Stack>
  );
}
