import { CachedBadge } from "../../sw/CachedBadge";
import { PanelWideToggle } from "../../ui/PanelWide";
import { useEffect, useState } from "react";
import { Button, Checkbox } from "@mantine/core";
import { AddToCartButton } from "../../cart/AddToCartButton";
import { itemKey, type CartInput } from "../../cart/store";
import { useCart } from "../../cart/useCart";
import { Alert, Anchor, Badge, CloseButton, Group, Paper, ScrollArea, Skeleton, Stack, Table, Text, Title } from "@mantine/core";
import { IconArrowLeft, IconExternalLink } from "@tabler/icons-react";
import { gursPublicViewUrl, valuationUrl, type Building, type BuildingPart } from "../../gurs";
import { partValue, useKoValues } from "../../values";
import { ValueCell, ValueSource } from "../../values/ValueCell";
import { buildingTx, useKoTx } from "../../transactions";
import { TxList } from "../../transactions/TxList";
import { PropertyResults } from "../../ezk/PropertyResults";
import { PartDetails } from "./PartDetails";
import { Fragment } from "react";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { SheetHandle, SheetSummary, useSheet } from "../../ui/Sheet";
import { useI18n, type MsgKey } from "../../i18n";

interface Props {
  building: Building;
  parts: BuildingPart[] | null;
  partsError?: boolean;
  onClose: () => void;
  /** Open the manager (upravnik) view. */
  onManager?: (id: number) => void;
  /** Return to the list this building was opened from (manager view). */
  onBack?: () => void;
}

export function BuildingPanel({ building: b, parts, partsError, onClose, onManager, onBack }: Props) {
  const { t, lang } = useI18n();
  const values = useKoValues(b.koId);
  const tx = useKoTx(b.koId);
  const nf = new Intl.NumberFormat(lang === "sl" ? "sl-SI" : "en-GB", { maximumFractionDigits: 1 });
  const row = (label: MsgKey, value: React.ReactNode) => (
    <Table.Tr>
      <Table.Th w="46%" style={{ fontWeight: 500, color: "var(--mantine-color-dimmed)" }}>{t(label)}</Table.Th>
      <Table.Td>{value ?? t("none")}</Table.Td>
    </Table.Tr>
  );
  const { store, keys } = useCart();
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [openPart, setOpenPart] = useState<number | null>(parts?.length === 1 ? parts[0].number : null);
  const single = parts?.length === 1 ? parts[0].number : null;
  useEffect(() => { setOpenPart(single); }, [b.eid, single]);
  const togglePart = (n: number) => setOpenPart((o) => (o === n ? null : n));
  const partInput = (p: BuildingPart): CartInput => ({
    kind: "part", koId: b.koId, koName: b.koName, number: String(b.number), part: p.number, eid: p.eid, geometry: b.geometry, note: p.use ?? undefined,
  });
  const toggle = (n: number) => setPicked((s) => { const x = new Set(s); if (x.has(n)) x.delete(n); else x.add(n); return x; });
  const addPicked = async () => {
    await store.add((parts ?? []).filter((p) => picked.has(p.number)).map(partInput));
    setPicked(new Set());
  };
  const sheet = useSheet(b.eid);
  // distinct managers of the parts (usually one per building)
  const managers = [...new Map((parts ?? []).filter((p) => p.manager).map((p) => [p.manager!.id, { ...p.manager!, parts: (parts ?? []).filter((x) => x.manager?.id === p.manager!.id).length }])).values()];
  const util = (Object.keys(b.utilities) as (keyof Building["utilities"])[]).filter((k) => b.utilities[k]);

  return (
    <Paper shadow="lg" radius="md" p="md" data-testid="building-panel" className="parcel-panel" {...sheet.attr}>
      <SheetHandle open={sheet.open} setOpen={sheet.setOpen} />
      {onBack && (
        <Button size="compact-xs" variant="subtle" px={4} mb={4} leftSection={<IconArrowLeft size={14} />} onClick={onBack}>{t("backToManager")}</Button>
      )}
      <Group justify="space-between" align="flex-start" wrap="nowrap" mb="xs">
        <div>
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>{t("building")}</Text>
          <Title order={2} size="h3" className="sheet-title">{b.number}</Title>
          <Text size="sm" c="dimmed">{t("ko")} {b.koId} {b.koName}</Text>
          <CachedBadge />
        </div>
        <Group gap={2} wrap="nowrap"><PanelWideToggle /><CloseButton aria-label={t("close")} onClick={onClose} /></Group>
      </Group>
      <SheetSummary>
        <Text size="sm" data-testid="sheet-summary" onClick={() => sheet.setOpen(true)} style={{ cursor: "pointer" }}>
          {[b.type, parts ? `${t("parts")}: ${parts.length}` : null].filter(Boolean).join(" · ")}
        </Text>
      </SheetSummary>
      <div className="sheet-body">
      <ScrollArea.Autosize mah="min(58vh, 560px)" type="auto" scrollbars="y" offsetScrollbars="y">
        <Table verticalSpacing={5} fz="sm">
          <Table.Tbody>
            {row("buildingType", b.type)}
            {row("floors", b.floors)}
            {row("flats", b.flats)}
            {row("businessUnits", b.businessUnits)}
            {row("yearBuilt", b.yearBuilt)}
            {row("facadeRenovated", b.facadeRenovated)}
            {row("structure", b.structure)}
            {row("manager", managers.length ? (
              <Stack gap={2} data-testid="building-managers">
                {managers.map((m) => (
                  <div key={m.id}>
                    {onManager ? <Anchor component="button" size="sm" ta="left" onClick={() => onManager(m.id)}>{m.name}</Anchor> : <Text size="sm">{m.name}</Text>}
                    <Text size="xs" c="dimmed">{[m.status, managers.length > 1 || m.parts !== parts?.length ? `${m.parts} ${t("managerParts")}` : null].filter(Boolean).join(" · ")}</Text>
                  </div>
                ))}
              </Stack>
            ) : null)}
            {row("utilities", util.length ? <Group gap={4}>{util.map((k) => <Badge key={k} size="sm" variant="light">{t(k)}</Badge>)}</Group> : null)}
          </Table.Tbody>
        </Table>

        <PropertyResults kind="building" ko={b.koId} n={b.number} defaultOpen />
        <Text size="xs" c="dimmed" tt="uppercase" fw={700} mt="md" mb={4}>
          {t("parts")}{parts ? ` (${parts.length})` : ""}
        </Text>
        {!parts ? (
          <Stack gap={6}>{[0, 1, 2].map((i) => <Skeleton key={i} h={16} />)}</Stack>
        ) : partsError ? (
          <Alert color="orange" variant="light" p="xs">{t("sectionError")}</Alert>
        ) : parts.length === 0 ? (
          <Text size="sm" c="dimmed">{t("noParts")}</Text>
        ) : (
          <Table striped fz="sm" verticalSpacing={4} horizontalSpacing={6} layout="fixed" data-testid="parts-table">
            <Table.Thead>
              <Table.Tr><Table.Th w={30} /><Table.Th w={48}>{t("partNo")}</Table.Th><Table.Th>{t("partUse")}</Table.Th><Table.Th w={86} ta="right">{t("partArea")}</Table.Th><Table.Th w={46} ta="right">{t("partFloor")}</Table.Th><Table.Th w={84} ta="right">{t("valueShort")}</Table.Th></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {parts.map((p) => (
                <Fragment key={p.eid}>
                <Table.Tr style={{ cursor: "pointer" }} onClick={(e) => { if (!(e.target as HTMLElement).closest("input,a,button")) togglePart(p.number); }} aria-expanded={openPart === p.number} data-testid="part-row">
                  <Table.Td>
                    {keys.has(itemKey(partInput(p)))
                      ? <Checkbox size="xs" checked disabled aria-label={`${t("inCart")} ${p.number}`} />
                      : <Checkbox size="xs" checked={picked.has(p.number)} onChange={() => toggle(p.number)} aria-label={`${t("buildingPart")} ${p.number}`} />}
                  </Table.Td>
                  <Table.Td style={{ whiteSpace: "nowrap" }}>{openPart === p.number ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}{p.number}</Table.Td>
                  <Table.Td style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.use ?? undefined}>{p.use ?? "—"}</Table.Td>
                  <Table.Td ta="right" style={{ whiteSpace: "nowrap" }}>{p.usableArea ?? p.area ? `${nf.format((p.usableArea ?? p.area)!)} m²` : "—"}</Table.Td>
                  <Table.Td ta="right">{p.floor ?? "—"}</Table.Td>
                  <Table.Td ta="right"><ValueCell size="xs" state={values} value={partValue(values.status === "ready" ? values.values : null, b.number, p.number)} href={p.id ? valuationUrl("part", p.id) : undefined} label={`${t("value")} ${p.number}`} /></Table.Td>
                </Table.Tr>
                {openPart === p.number && (
                  <Table.Tr><Table.Td colSpan={6} style={{ background: "var(--mantine-color-body)" }} aria-label={t("partDetails")}>
                    <PartDetails part={p} building={b.number} values={values} tx={tx} cartItem={partInput(p)} />
                  </Table.Td></Table.Tr>
                )}
                </Fragment>
              ))}
            </Table.Tbody>
          </Table>
        )}
        {parts && parts.length > 0 && <ValueSource state={values} />}
        <Text size="xs" c="dimmed" tt="uppercase" fw={700} mt="md" mb={4}>{t("txTitle")}</Text>
        <TxList state={tx} items={buildingTx(tx.status === "ready" ? tx.tx : null, b.number)} />
      </ScrollArea.Autosize>
      </div>
      <Group justify="space-between" mt="sm" gap={6}>
        <Anchor href={gursPublicViewUrl(b.eid)} target="_blank" rel="noopener" size="sm" display="inline-flex" style={{ alignItems: "center", gap: 4 }}>
          {t("openGurs")} <IconExternalLink size={14} />
        </Anchor>
        <Group gap={6}>
          {picked.size > 0 && <Button size="xs" color="teal" onClick={() => void addPicked()}>{t("addParts")} ({picked.size})</Button>}
          <AddToCartButton item={{ kind: "building", koId: b.koId, koName: b.koName, number: String(b.number), eid: b.eid, geometry: b.geometry }} />
        </Group>
      </Group>
    </Paper>
  );
}
