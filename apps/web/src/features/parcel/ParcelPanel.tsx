import { CachedBadge } from "../../sw/CachedBadge";
import { PanelWideToggle } from "../../ui/PanelWide";
import { AddToCartButton } from "../../cart/AddToCartButton";
import { Alert, Anchor, Badge, CloseButton, Group, Paper, ScrollArea, Skeleton, Stack, Table, Text, Title } from "@mantine/core";
import { IconAlertTriangle, IconExternalLink } from "@tabler/icons-react";
import { gursPublicViewUrl, valuationUrl, type Parcel, type ParcelDetails } from "../../gurs";
import { useI18n, type MsgKey } from "../../i18n";
import { formatEur, parcelValue, useKoValues } from "../../values";
import { ValueCell, ValueSource } from "../../values/ValueCell";
import { parcelTx, useKoTx } from "../../transactions";
import { TxList } from "../../transactions/TxList";
import { PropertyResults } from "../../ezk/PropertyResults";
import { SheetHandle, SheetSummary, useSheet } from "../../ui/Sheet";

interface Props {
  parcel: Parcel;
  details: ParcelDetails | null;
  onClose: () => void;
  onBuilding?: (number: number) => void;
}

const fmtArea = (m2: number, lang: string) => `${m2.toLocaleString(lang === "sl" ? "sl-SI" : "en-GB")} m²`;

export function ParcelPanel({ parcel, details, onClose, onBuilding }: Props) {
  const { t, lang } = useI18n();
  const sheet = useSheet(parcel.eid);
  const values = useKoValues(parcel.koId);
  const tx = useKoTx(parcel.koId);
  const pv = values.status === "ready" ? parcelValue(values.values, parcel.number) : undefined;
  const failed = (k: ParcelDetails["errors"][number]) => details?.errors.includes(k);

  const row = (label: MsgKey, value: React.ReactNode, key?: ParcelDetails["errors"][number]) => (
    <Table.Tr>
      <Table.Th w="42%" style={{ verticalAlign: "top", fontWeight: 500, color: "var(--mantine-color-dimmed)" }}>{t(label)}</Table.Th>
      <Table.Td>
        {!details && key ? <Skeleton h={14} w="70%" /> : key && failed(key) ? <Text size="sm" c="orange">{t("sectionError")}</Text> : value}
      </Table.Td>
    </Table.Tr>
  );

  return (
    <Paper
      shadow="lg" radius="md" p="md" data-testid="parcel-panel"
      className="parcel-panel" {...sheet.attr}
    >
      <SheetHandle open={sheet.open} setOpen={sheet.setOpen} />
      <Group justify="space-between" align="flex-start" wrap="nowrap" mb="xs">
        <div>
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>{t("parcel")}</Text>
          <Title order={2} size="h3" className="sheet-title">{parcel.number}</Title>
          <Text size="sm" c="dimmed">{t("ko")} {parcel.koId} {parcel.koName}</Text>
          <CachedBadge />
        </div>
        <Group gap={2} wrap="nowrap"><PanelWideToggle /><CloseButton aria-label={t("close")} onClick={onClose} /></Group>
      </Group>
      <SheetSummary>
        <Text size="sm" data-testid="sheet-summary" onClick={() => sheet.setOpen(true)} style={{ cursor: "pointer" }}>
          {[fmtArea(parcel.area, lang), pv != null ? formatEur(pv, lang) : null, details?.intendedUse?.map((u) => u.code).join(", "),
            details?.buildings?.length ? `${details.buildings.length} × ${t("building").toLowerCase()}` : null].filter(Boolean).join(" · ")}
        </Text>
      </SheetSummary>
      <div className="sheet-body">
      <ScrollArea.Autosize mah="min(55vh, 520px)" type="auto" offsetScrollbars>
        <Table verticalSpacing={6} fz="sm">
          <Table.Tbody>
            {row("value", <><ValueCell state={values} value={pv} href={parcel.id ? valuationUrl("parcel", parcel.id) : undefined} label={t("value")} /><ValueSource state={values} /></>)}
            {row("area", fmtArea(parcel.area, lang))}
            {row("soilQuality", parcel.soilQuality ?? t("none"))}
            {row("landUse", details?.landUse?.length ? details.landUse.join(", ") : t("none"), "landUse")}
            {row("intendedUse", details?.intendedUse?.length
              ? <Stack gap={2}>{details.intendedUse.map((u) => <Text component="div" size="sm" key={u.code}><Badge size="sm" variant="light" mr={6}>{u.code}</Badge>{u.description}</Text>)}</Stack>
              : t("none"), "intendedUse")}
            {row("spatialPlanUnit", details?.spatialPlanUnit
              ? <><Text size="sm" fw={600}>{details.spatialPlanUnit.code}</Text><Text size="xs" c="dimmed">{details.spatialPlanUnit.plan}</Text></>
              : t("none"), "spatialPlanUnit")}
            {row("buildingsOnParcel", details?.buildings?.length
              ? <Group gap={4}>{details.buildings.map((b) => <Badge key={b.eid} component="button" type="button" onClick={() => onBuilding?.(b.number)} variant="outline" color="teal" style={{ cursor: "pointer" }} title={`${b.areaOnParcel} m²`}>{t("building")} {b.number}</Badge>)}</Group>
              : t("noBuildings"), "buildings")}
          </Table.Tbody>
        </Table>
        <PropertyResults kind="parcel" ko={parcel.koId} n={parcel.number} defaultOpen />
        <Text size="xs" c="dimmed" tt="uppercase" fw={700} mt="md" mb={4}>{t("txTitle")}</Text>
        <TxList state={tx} items={parcelTx(tx.status === "ready" ? tx.tx : null, parcel.number)} land />
        {details && details.errors.length > 0 && (
          <Alert mt="xs" color="orange" variant="light" icon={<IconAlertTriangle size={16} />} p="xs">{t("sectionError")}</Alert>
        )}
      </ScrollArea.Autosize>
      </div>
      <Group justify="space-between" mt="sm" gap={6}>
        <Anchor href={gursPublicViewUrl(parcel.eid)} target="_blank" rel="noopener" size="sm" display="inline-flex" style={{ alignItems: "center", gap: 4 }}>
          {t("openGurs")} <IconExternalLink size={14} />
        </Anchor>
        <AddToCartButton item={{ kind: "parcel", koId: parcel.koId, koName: parcel.koName, number: parcel.number, eid: parcel.eid, geometry: parcel.geometry }} />
      </Group>
    </Paper>
  );
}
