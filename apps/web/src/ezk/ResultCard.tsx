import { ActionIcon, Badge, Collapse, Group, Paper, Stack, Table, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { IconChevronDown, IconChevronRight, IconFileTypePdf, IconMapPin, IconX } from "@tabler/icons-react";
import { useI18n, type MsgKey } from "../i18n";
import { formatEur, parcelValue, partValue, useKoValues } from "../values";
import { RightsList, fmtDay } from "./RightsList";
import type { ResultRecord } from "./results";
import type { Holder, Owner, Right } from "./types";

const CAT: Record<Right["category"], { key: MsgKey; color: string }> = {
  mortgage: { key: "catMortgage", color: "red" },
  easement: { key: "catEasement", color: "blue" },
  note: { key: "catNote", color: "gray" },
  other: { key: "catOther", color: "gray" },
};

const holderId = (h: Holder) => (h.kind === "person" ? (h.birthDate ? fmtDay(h.birthDate) : "") : h.kind === "company" ? h.companyId ?? "" : "");
export const ownerName = (o: Owner, ownerOf: string) => (o.holder.kind === "ownerOf" ? `${ownerOf}: ${o.holder.name}` : o.holder.name);

/** Short burden chips for the collapsed card: mortgages with amounts, other categories counted. */
export function burdenChips(rights: Right[]) {
  const out: { key: string; cat: Right["category"]; landCharge?: boolean; amount?: string; count: number }[] = [];
  for (const r of rights) {
    if (r.category === "mortgage") {
      out.push({ key: `m${r.id}`, cat: "mortgage", landCharge: /zemljišk\w* dolg/i.test(r.type), amount: r.charge?.amountText, count: 1 });
    } else {
      const c = out.find((x) => x.cat === r.category && x.cat !== "mortgage");
      if (c) c.count++; else out.push({ key: r.category, cat: r.category, count: 1 });
    }
  }
  return out;
}

function Chips({ record }: { record: ResultRecord }) {
  const { t } = useI18n();
  const chips = burdenChips(record.extract.rights ?? []);
  return (
    <Group gap={4} wrap="wrap">
      {record.extract.pending && <Badge color="red" variant="filled" size="sm">{t("pendingCase")}</Badge>}
      {chips.length === 0 && !record.extract.pending && <Badge color="teal" variant="light" size="sm">{t("noBurdens")}</Badge>}
      {chips.map((c) => (
        <Badge key={c.key} color={CAT[c.cat].color} variant="light" size="sm" style={{ textTransform: "none" }}>
          {c.count > 1 ? `${c.count}× ` : ""}{t(c.landCharge ? "catLandCharge" : CAT[c.cat].key)}{c.amount ? ` ${c.amount.replace(/,00 EUR$/, " €").replace(/ EUR$/, " €")}` : ""}
        </Badge>
      ))}
    </Group>
  );
}

/** One-line owner summary (max 2 owners, +N). */
export function ownersLine(owners: Owner[], ownerOf: string) {
  return owners.slice(0, 2).map((o) => `${ownerName(o, ownerOf)} ${o.share}`).join(" · ") + (owners.length > 2 ? ` · +${owners.length - 2}` : "");
}

/** Compact owner + burden line for table rows (building parts). */
export function OwnerLine({ record }: { record: ResultRecord }) {
  const { t } = useI18n();
  const x = record.extract;
  const rights = x.rights ?? [];
  const mortgages = rights.filter((r) => r.category === "mortgage").length;
  const line = ownersLine(x.owners, t("ownerOf"));
  return (
    <Group gap={4} wrap="nowrap" data-testid="part-owner" style={{ minWidth: 0 }}>
      {x.pending && <Badge size="xs" color="red" variant="filled" title={t("pendingCase")}>P</Badge>}
      {mortgages > 0 && <Badge size="xs" color="red" variant="light" title={t("catMortgage")} style={{ flexShrink: 0 }}>{mortgages > 1 ? `${mortgages}× ` : ""}H</Badge>}
      <Text size="xs" c="violet.7" truncate title={`${line} (${t("extractDate")} ${fmtDay(x.createdAt)})`}>{line}</Text>
    </Group>
  );
}

function Value({ record }: { record: ResultRecord }) {
  const { lang } = useI18n();
  const p = record.extract.property;
  const st = useKoValues(p.koId);
  if (st.status !== "ready" || !st.values || !p.number) return null;
  const v = p.type === "part" ? partValue(st.values, p.number, p.part ?? "") : p.type === "parcel" ? parcelValue(st.values, p.number) : undefined;
  return v == null ? null : <Text size="sm" fw={600} style={{ whiteSpace: "nowrap" }} title="GURS">{formatEur(v, lang)}</Text>;
}

interface Props {
  record: ResultRecord;
  owners: Owner[];
  open: boolean;
  onToggle: () => void;
  onOpenProperty?: (r: ResultRecord) => void;
  onOpenPdf?: (r: ResultRecord) => void;
  onRemove: (r: ResultRecord) => void;
}

export function ResultCard({ record, owners, open, onToggle, onOpenProperty, onOpenPdf, onRemove }: Props) {
  const { t } = useI18n();
  const x = record.extract;
  const p = x.property;
  const all = x.owners;
  const ownersText = ownersLine(owners, t("ownerOf"));
  return (
    <Paper withBorder radius="md" p="sm" data-testid="result-group">
      <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
        <UnstyledButton onClick={onToggle} style={{ minWidth: 0, flex: 1 }} aria-expanded={open}>
          <Group gap={6} wrap="nowrap" align="flex-start">
            {open ? <IconChevronDown size={18} style={{ flexShrink: 0, marginTop: 2 }} /> : <IconChevronRight size={18} style={{ flexShrink: 0, marginTop: 2 }} />}
            <div style={{ minWidth: 0 }}>
              <Text fw={700} size="sm">{p.label}</Text>
              <Text size="xs" c="dimmed" truncate>
                {[p.typeLabel?.replace(/^\d+ - /, ""), p.address, `${t("extractDate")} ${fmtDay(x.createdAt)}`].filter(Boolean).join(" · ")}
              </Text>
            </div>
          </Group>
        </UnstyledButton>
        <Group gap={2} wrap="nowrap">
          <Value record={record} />
          {onOpenProperty && <Tooltip label={t("showOnMap")} withArrow><ActionIcon variant="subtle" aria-label={`${t("showOnMap")} ${p.label}`} onClick={() => onOpenProperty(record)}><IconMapPin size={16} /></ActionIcon></Tooltip>}
          {record.hasPdf && onOpenPdf && (
            <Tooltip label={t("openPdf")} withArrow><ActionIcon variant="subtle" aria-label={`${t("openPdf")} ${p.label}`} onClick={() => onOpenPdf(record)}><IconFileTypePdf size={16} /></ActionIcon></Tooltip>
          )}
          <ActionIcon variant="subtle" color="gray" aria-label={`${t("remove")} ${p.label}`} onClick={() => onRemove(record)}><IconX size={16} /></ActionIcon>
        </Group>
      </Group>
      <Stack gap={4} mt={6} pl={24}>
        <Text size="sm" lineClamp={2}>{ownersText || "—"}{all.length !== owners.length ? ` (${owners.length}/${all.length})` : ""}</Text>
        <Chips record={record} />
      </Stack>
      <Collapse in={open}>
        <Stack gap="sm" mt="sm" pl={24}>
          <Table.ScrollContainer minWidth={560}>
            <Table verticalSpacing={4} fz="sm" data-testid="owners-table">
              <Table.Thead>
                <Table.Tr><Table.Th>{t("colOwner")}</Table.Th><Table.Th w={70}>{t("colShare")}</Table.Th><Table.Th w={120}>{t("colId")}</Table.Th><Table.Th>{t("colAddress")}</Table.Th><Table.Th>{t("colRestrictions")}</Table.Th></Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {owners.map((o, i) => (
                  <Table.Tr key={`${o.positionId}-${i}`} data-testid="owner-row">
                    <Table.Td>{ownerName(o, t("ownerOf"))}{o.right && !o.right.startsWith("101 ") && <Text size="xs" c="dimmed">{o.right}</Text>}</Table.Td>
                    <Table.Td>{o.share}</Table.Td>
                    <Table.Td>{holderId(o.holder)}</Table.Td>
                    <Table.Td>{"address" in o.holder ? o.holder.address : ""}</Table.Td>
                    <Table.Td>
                      <Group gap={4}>{o.restrictions.map((r) => (
                        <Badge key={r.id} size="xs" variant="light" color={r.type.startsWith("401") ? "red" : "gray"} title={`${r.id} · ${r.type}`}>
                          {r.type.split(" - ")[1]?.replace(/^vknjižena /, "") ?? r.type}
                        </Badge>
                      ))}</Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          <RightsList extract={x} />
        </Stack>
      </Collapse>
    </Paper>
  );
}
