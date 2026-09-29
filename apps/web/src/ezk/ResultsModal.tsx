import { Fragment, useState } from "react";
import {
  ActionIcon, Alert, Badge, Button, FileButton, Group, Loader, Modal, Paper, ScrollArea, Stack, Table, Text, TextInput, UnstyledButton,
} from "@mantine/core";
import { IconDownload, IconFileSpreadsheet, IconFileTypePdf, IconSearch, IconX } from "@tabler/icons-react";
import { useI18n, type MsgKey } from "../i18n";
import { useResults } from "./useResults";
import { FoldersPanel } from "./FoldersPanel";
import { useCart } from "../cart/useCart";
import { groupResults, type ResultRecord } from "./results";
import { RightsList } from "./RightsList";
import { addPdfFiles, type AddFilesResult } from "./addFiles";
import type { EzkExtract, Holder, Owner } from "./types";

interface Props {
  opened: boolean;
  onClose: () => void;
  onOpenProperty?: (r: ResultRecord) => void;
  /** Injected in tests (pdf.js does not run in jsdom). */
  parse?: (bytes: Uint8Array) => Promise<EzkExtract>;
  /** Injected in tests; defaults to a browser download. */
  download?: (fileName: string, bytes: Uint8Array, mime: string) => void;
}

function browserDownload(fileName: string, bytes: Uint8Array, mime: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const a = document.createElement("a");
  a.href = url; a.download = fileName; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const REASON: Record<string, MsgKey> = {
  notPdf: "ezkNotPdf", tooLarge: "ezkTooLarge", tooManyPages: "ezkTooManyPages", notEzk: "ezkNotEzk", unsupported: "ezkUnsupported",
};

const fmtDate = (iso?: string) => (iso ? iso.slice(0, 10).split("-").reverse().join(". ").replace(/^0/, "").replace(/\. 0/, ". ") : "");

function holderId(h: Holder) {
  if (h.kind === "person") return h.birthDate ? fmtDate(h.birthDate) : "";
  if (h.kind === "company") return h.companyId ?? "";
  return "";
}

function RestrictionBadges({ o }: { o: Owner }) {
  return (
    <Group gap={4}>
      {o.restrictions.map((r) => (
        <Badge key={r.id} size="sm" variant="light" color={r.type.startsWith("401") ? "red" : "gray"} title={`${r.id} · ${r.type}`} style={{ maxWidth: "100%" }}>
          {r.type.split(" - ")[1]?.replace(/^vknjižena /, "") ?? r.type}
        </Badge>
      ))}
    </Group>
  );
}

export function ResultsModal({ opened, onClose, onOpenProperty, parse, download = browserDownload }: Props) {
  const { t } = useI18n();
  const { store, records } = useResults();
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<AddFilesResult | null>(null);
  const mobile = typeof window !== "undefined" && window.innerWidth < 640;
  const groups = groupResults(records, filter);
  const cart = useCart();
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState<{ missing: string[] } | null>(null);

  /** Exports what is visible (the owner filter narrows the export too). */
  const doExport = async (kind: "zip" | "xlsx") => {
    setExporting(true);
    try {
      const ex = await import("../export");
      const recs = groups.map((g) => g.record);
      const date = new Date().toISOString().slice(0, 10);
      if (kind === "zip") {
        const pdfs = await store.pdfs(recs.map((r) => r.key));
        const geometries = new Map(cart.items.map((i) => [i.key, i.geometry]));
        const r = await ex.buildExportZip(recs, { date, pdfs, geometries });
        download(r.fileName, r.zip, "application/zip");
        setExported({ missing: r.missingPdf });
      } else {
        const bytes = await ex.toXlsx([{ name: "Lastniki", table: ex.ownerTable(recs) }, { name: "Bremena", table: ex.rightsTable(recs) }]);
        download(`ikataster-izvoz-${date}.xlsx`, bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        setExported({ missing: [] });
      }
    } finally { setExporting(false); }
  };

  const onFiles = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    try { setLast(await addPdfFiles(files, store, parse)); } finally { setBusy(false); }
  };

  return (
    <Modal opened={opened} onClose={onClose} fullScreen={mobile} size="min(1100px, 96vw)"
      title={<Text fw={700}>{t("resultsTitle")} ({records.length})</Text>} scrollAreaComponent={ScrollArea.Autosize}
      styles={{ body: { overflowX: "hidden" } }}>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">{t("resultsHelp")}</Text>
        <FoldersPanel store={store} currentCount={records.length} />
        <Group gap="sm" wrap="wrap">
          <FileButton multiple accept="application/pdf,.pdf" onChange={(f) => void onFiles(f)}>
            {(props) => <Button {...props} size="sm" leftSection={busy ? <Loader size={14} /> : <IconFileTypePdf size={16} />} disabled={busy}>{busy ? t("resultsReading") : t("resultsAdd")}</Button>}
          </FileButton>
          {records.length > 0 && (
            <TextInput style={{ flex: 1, minWidth: 200, maxWidth: "100%" }} size="sm" leftSection={<IconSearch size={14} />} placeholder={t("resultsFilter")}
              aria-label={t("resultsFilter")} value={filter} onChange={(e) => setFilter(e.currentTarget.value)} />
          )}
        </Group>
        {records.length > 0 && (
          <Group gap="xs">
            <Button size="xs" variant="light" leftSection={exporting ? <Loader size={12} /> : <IconDownload size={14} />} disabled={exporting || !groups.length}
              onClick={() => void doExport("zip")}>{exporting ? t("exporting") : t("exportZip")}</Button>
            <Button size="xs" variant="subtle" leftSection={<IconFileSpreadsheet size={14} />} disabled={exporting || !groups.length}
              onClick={() => void doExport("xlsx")}>{t("exportXlsx")}</Button>
          </Group>
        )}
        {exported && (
          <Alert color={exported.missing.length ? "orange" : "teal"} p="xs" withCloseButton onClose={() => setExported(null)} data-testid="export-report">
            <Text size="sm">{t("exportDone")}</Text>
            {exported.missing.length > 0 && <Text size="sm">{t("exportMissingPdf")}: {exported.missing.join(", ")}</Text>}
          </Alert>
        )}
        {last && (last.added > 0 || last.failed.length > 0) && (
          <Alert color={last.failed.length ? "orange" : "teal"} p="xs" withCloseButton onClose={() => setLast(null)} data-testid="results-report">
            <Text size="sm">{t("resultsAdded")}: {last.added}</Text>
            {last.failed.map((f) => (
              <Text size="sm" key={f.name}>{t("resultsFailed")}: {f.name} – {t(REASON[f.reason] ?? "ezkUnknown")}</Text>
            ))}
          </Alert>
        )}
        {records.length === 0 ? (
          <Text c="dimmed" size="sm">{t("resultsEmpty")}</Text>
        ) : groups.length === 0 ? (
          <Text c="dimmed" size="sm">{t("resultsNoMatch")}</Text>
        ) : mobile ? (
          <Stack gap="sm" data-testid="results-cards">
            {groups.map(({ record, owners }) => {
              const p = record.extract.property;
              return (
                <Paper key={record.key} withBorder radius="md" p="xs" data-testid="result-group">
                  <Group justify="space-between" wrap="nowrap" gap="xs" align="flex-start">
                    <UnstyledButton onClick={() => onOpenProperty?.(record)} style={{ minWidth: 0 }}>
                      <Text fw={700} size="sm">{p.label}</Text>
                      <Text size="xs" c="dimmed">{[p.address, `${t("extractDate")} ${fmtDate(record.extract.createdAt)}`].filter(Boolean).join(" · ")}</Text>
                    </UnstyledButton>
                    <ActionIcon variant="subtle" color="gray" aria-label={`${t("remove")} ${p.label}`} onClick={() => void store.remove([record.key])}><IconX size={16} /></ActionIcon>
                  </Group>
                  {record.extract.pending && <Badge color="red" variant="light" mt={4}>{t("pendingCase")}</Badge>}
                  {owners.map((o, i) => (
                    <Stack key={`${o.positionId}-${i}`} gap={2} mt="xs" pt="xs" data-testid="owner-row" style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}>
                      <Group justify="space-between" wrap="nowrap" gap="xs">
                        <Text size="sm" fw={600}>{o.holder.kind === "ownerOf" ? `${t("ownerOf")}: ${o.holder.name}` : o.holder.name}</Text>
                        <Text size="sm" fw={600}>{o.share}</Text>
                      </Group>
                      <Text size="xs" c="dimmed">{[holderId(o.holder), "address" in o.holder ? o.holder.address : ""].filter(Boolean).join(" · ")}</Text>
                      <RestrictionBadges o={o} />
                    </Stack>
                  ))}
                  {(record.extract.rights?.length || record.extract.benefits?.length) ? (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--mantine-color-default-border)" }}><RightsList extract={record.extract} /></div>
                  ) : null}
                </Paper>
              );
            })}
          </Stack>
        ) : (
          <Table.ScrollContainer minWidth={720}>
            <Table striped={false} verticalSpacing={6} data-testid="results-table">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("colOwner")}</Table.Th><Table.Th>{t("colShare")}</Table.Th><Table.Th>{t("colId")}</Table.Th>
                  <Table.Th>{t("colAddress")}</Table.Th><Table.Th>{t("colRestrictions")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {groups.map(({ record, owners }) => {
                  const p = record.extract.property;
                  return (
                    <Fragment key={record.key}>
                      <Table.Tr data-testid="result-group" style={{ background: "var(--mantine-color-default-hover)" }}>
                        <Table.Td colSpan={5}>
                          <Group justify="space-between" wrap="nowrap" gap="xs">
                            <UnstyledButton onClick={() => onOpenProperty?.(record)} title={t("showOnMap")} style={{ minWidth: 0 }}>
                              <Text fw={700} size="sm">{p.label}</Text>
                              <Text size="xs" c="dimmed" truncate>
                                {[p.typeLabel?.replace(/^\d+ - /, ""), p.address, `${t("extractDate")} ${fmtDate(record.extract.createdAt)}`].filter(Boolean).join(" · ")}
                              </Text>
                            </UnstyledButton>
                            <Group gap={6} wrap="nowrap">
                              {record.extract.pending && <Badge color="red" variant="light">{t("pendingCase")}</Badge>}
                              <ActionIcon variant="subtle" color="gray" aria-label={`${t("remove")} ${p.label}`} onClick={() => void store.remove([record.key])}>
                                <IconX size={16} />
                              </ActionIcon>
                            </Group>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                      {owners.map((o, i) => (
                        <Table.Tr key={`${o.positionId}-${i}`} data-testid="owner-row">
                          <Table.Td>
                            <Text size="sm">{o.holder.kind === "ownerOf" ? `${t("ownerOf")}: ${o.holder.name}` : o.holder.name}</Text>
                            {o.right && !o.right.startsWith("101 ") && <Text size="xs" c="dimmed">{o.right}</Text>}
                          </Table.Td>
                          <Table.Td><Text size="sm">{o.share}</Text></Table.Td>
                          <Table.Td><Text size="sm">{holderId(o.holder)}</Text></Table.Td>
                          <Table.Td><Text size="sm">{"address" in o.holder ? o.holder.address : ""}</Text></Table.Td>
                          <Table.Td><RestrictionBadges o={o} /></Table.Td>
                        </Table.Tr>
                      ))}
                      {(record.extract.rights?.length || record.extract.benefits?.length) ? (
                        <Table.Tr><Table.Td colSpan={5}><RightsList extract={record.extract} /></Table.Td></Table.Tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Stack>
    </Modal>
  );
}
