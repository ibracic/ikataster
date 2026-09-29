import { useState } from "react";
import { Badge, Button, Group, Skeleton, Stack, Table, Text, UnstyledButton } from "@mantine/core";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
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

const SALE_KIND: Record<number, [string, string]> = {
  1: ["prodaja na prostem trgu", "open-market sale"], 2: ["prostovoljna javna dražba", "voluntary public auction"],
  3: ["javna dražba (izvršba, stečaj)", "forced public auction"], 4: ["prodaja med povezanimi osebami", "sale between related parties"],
  5: ["finančni najem (lizing)", "financial lease"], 6: ["stavbna pravica", "building right"],
  7: ["prodaja namesto razlastitve", "sale instead of expropriation"], 8: ["razlastitev", "expropriation"],
};
const RENT_KIND: Record<number, [string, string]> = {
  1: ["oddajanje na prostem trgu", "open-market lease"], 2: ["med povezanimi osebami", "between related parties"],
  3: ["denacionalizirano stanovanje", "denationalised flat"], 4: ["drugo odplačno oddajanje", "other paid lease"],
  5: ["neprofitna najemnina", "non-profit rent"],
};
const MARKET: Record<number, [string, string]> = {
  1: ["tržen posel", "market deal"], 2: ["tržen posel, neustrezni podatki", "market deal, incomplete data"],
  3: ["netržni posel", "non-market deal"], 4: ["neopredeljen", "not classified"], 5: ["v preverjanju", "being checked"],
};

function Row({ i, land }: { i: TxItem; land?: boolean }) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const L = lang === "sl" ? 0 : 1;
  const typeName = (c: number | null | undefined) => (c != null ? (land ? LAND_TYPE : PART_TYPE)[c]?.[L] : undefined);
  const nf = new Intl.NumberFormat(lang === "sl" ? "sl-SI" : "en-GB", { maximumFractionDigits: 1 });
  const eur = (v: number) => `${formatEur(v, lang)}${i.kind === "rent" ? t("txPerMonth") : ""}`;
  const partial = (sh?: string) => sh && !/^(\d+)\/\1$/.test(sh);
  const summary = [
    i.parts ? `${i.parts.length} ${t("txPartsN")}` : i.part && `${t("txPart")} ${i.part}`,
    i.parts ? null : typeName(i.type), i.area ? `${nf.format(i.area)} m²` : null,
  ].filter(Boolean).join(" · ");
  const kindName = i.dealKind != null ? (i.kind === "rent" ? RENT_KIND : SALE_KIND)[i.dealKind]?.[L] : undefined;
  const details: [string, React.ReactNode][] = [
    [t("txDealKind"), kindName],
    [t("txMarket"), i.market != null ? MARKET[i.market]?.[L] : null],
    [t(i.kind === "rent" ? "txRentTotal" : "txPriceTotal"), i.price != null ? eur(i.price) : null],
    [t("txCovers"), i.wholeDeal && i.items > 1 ? t(i.kind === "rent" ? "txWholeLease" : "txWholeDeal").replace("{n}", String(i.items)) : null],
    [t("txParcels"), i.kind === "sale" && i.parcels ? String(i.parcels) : null],
    [t("txPerM2"), i.perM2 != null ? `${nf.format(i.perM2)} €/m²${i.kind === "rent" ? t("txPerMonth") : ""}` : null],
    [t("txLease"), i.kind === "rent" && (i.start || i.end) ? `${i.start ? fmtDate(i.start) : "?"} – ${i.end ? fmtDate(i.end) : t("txOpenEnded")}` : null],
    [t("txType"), !i.rows ? typeName(i.type) : null],
    [t("txArea"), !i.rows && i.area ? `${nf.format(i.area)} m²` : null],
    [t("txShare"), !i.rows && partial(i.share) ? i.share : null],
    [t("partFloor"), !i.rows ? i.floor : null],
    [t("txDealId"), String(Math.abs(i.deal))],
  ];
  return (
    <div data-testid="tx-row" style={{ borderTop: "1px solid var(--mantine-color-default-border)", paddingTop: 4 }}>
      <UnstyledButton onClick={() => setOpen((o) => !o)} aria-expanded={open} w="100%" data-testid="tx-toggle">
        <Group justify="space-between" wrap="nowrap" gap="xs" align="flex-start">
          <div style={{ minWidth: 0 }}>
            <Group gap={6} wrap="nowrap">
              {open ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
              <Text size="sm" fw={600} style={{ whiteSpace: "nowrap" }}>{fmtDate(i.date)}</Text>
              <Badge size="xs" variant="light" color={i.kind === "rent" ? "grape" : "blue"} style={{ flexShrink: 0 }}>{t(i.kind === "rent" ? "txRent" : "txSale")}</Badge>
              {(i.market === 3 || i.market === 5) && <Badge size="xs" variant="outline" color="gray" style={{ flexShrink: 0 }}>{t(i.market === 5 ? "txChecking" : "txNonMarket")}</Badge>}
            </Group>
            {summary && <Text size="xs" c="dimmed" pl={20}>{summary}</Text>}
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <Text size="sm" fw={600} style={{ whiteSpace: "nowrap" }}>{i.price != null ? eur(i.price) : "—"}</Text>
            {i.wholeDeal && i.items > 1
              ? <Text size="xs" c="dimmed">{t("txWholeShort")}</Text>
              : i.perM2 != null && <Text size="xs" c="dimmed">{nf.format(i.perM2)} €/m²{i.kind === "rent" ? t("txPerMonth") : ""}</Text>}
          </div>
        </Group>
      </UnstyledButton>
      {open && (
        <div data-testid="tx-details" style={{ padding: "4px 0 8px 20px" }}>
          <Table verticalSpacing={2} fz="xs">
            <Table.Tbody>
              {details.filter(([, v]) => v != null && v !== "").map(([k, v]) => (
                <Table.Tr key={k}><Table.Th w="42%" style={{ fontWeight: 500, color: "var(--mantine-color-dimmed)" }}>{k}</Table.Th><Table.Td>{v}</Table.Td></Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          {i.rows && (
            <Table verticalSpacing={2} fz="xs" mt={6} striped data-testid="tx-parts">
              <Table.Thead><Table.Tr><Table.Th>{t("partNo")}</Table.Th><Table.Th>{t("txType")}</Table.Th><Table.Th ta="right">{t("txArea")}</Table.Th><Table.Th ta="right">{t("partFloor")}</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>
                {i.rows.map((r) => (
                  <Table.Tr key={r.part}>
                    <Table.Td>{r.part}</Table.Td>
                    <Table.Td>{typeName(r.type) ?? "—"}{partial(r.share) ? ` (${r.share})` : ""}</Table.Td>
                    <Table.Td ta="right" style={{ whiteSpace: "nowrap" }}>{r.area ? `${nf.format(r.area)} m²` : "—"}</Table.Td>
                    <Table.Td ta="right">{r.floor || "—"}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </div>
      )}
    </div>
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
