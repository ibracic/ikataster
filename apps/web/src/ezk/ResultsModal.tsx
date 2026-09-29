import { useState } from "react";
import {
  ActionIcon, Alert, Badge, Button, FileButton, Group, Loader, Modal, Paper, ScrollArea, Stack, Table, Text, TextInput, UnstyledButton,
} from "@mantine/core";
import { IconDownload, IconFileSpreadsheet, IconFileTypePdf, IconSearch, IconX } from "@tabler/icons-react";
import { useI18n, type MsgKey } from "../i18n";
import { useResults } from "./useResults";
import { FoldersPanel } from "./FoldersPanel";
import { useCart } from "../cart/useCart";
import { groupResults, type ResultRecord } from "./results";
import { ResultCard } from "./ResultCard";
import { addPdfFiles, type AddFilesResult } from "./addFiles";
import type { EzkExtract } from "./types";

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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const allOpen = groups.length > 0 && groups.every((g) => expanded.has(g.record.key));
  const burdened = groups.filter((g) => g.record.extract.pending || (g.record.extract.rights ?? []).some((r) => r.category === "mortgage")).length;
  const summary = `${groups.length} ${t("summaryProps")} · ${burdened} ${t("summaryMortgaged")}`;
  const openPdf = async (r: ResultRecord) => {
    const bytes = (await store.pdfs([r.key])).get(r.key);
    if (!bytes) return;
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 120_000);
  };

  /** Exports what is visible (the owner filter narrows the export too). */
  const doExport = async (kind: "zip" | "xlsx") => {
    setExporting(true);
    try {
      const ex = await import("../export");
      const recs = groups.map((g) => g.record);
      const date = new Date().toISOString().slice(0, 10);
      const values = await (await import("../values/forRecords")).valuesForRecords(recs).catch(() => new Map<string, number>());
      if (kind === "zip") {
        const pdfs = await store.pdfs(recs.map((r) => r.key));
        const geometries = new Map(cart.items.map((i) => [i.key, i.geometry]));
        const r = await ex.buildExportZip(recs, { date, pdfs, geometries, values });
        download(r.fileName, r.zip, "application/zip");
        setExported({ missing: r.missingPdf });
      } else {
        const bytes = await ex.toXlsx([{ name: "Lastniki", table: ex.ownerTable(recs, undefined, values) }, { name: "Bremena", table: ex.rightsTable(recs) }]);
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
        ) : (
          <Stack gap="xs" data-testid="results-list">
            <Group justify="space-between" gap="xs">
              <Text size="sm" c="dimmed" data-testid="results-summary">{summary}</Text>
              <Button size="compact-xs" variant="subtle" onClick={() => setExpanded(allOpen ? new Set() : new Set(groups.map((g) => g.record.key)))}>
                {allOpen ? t("collapseAll") : t("expandAll")}
              </Button>
            </Group>
            {groups.map(({ record, owners }) => (
              <ResultCard key={record.key} record={record} owners={owners}
                open={!!filter.trim() || expanded.has(record.key)}
                onToggle={() => setExpanded((e) => { const n = new Set(e); if (n.has(record.key)) n.delete(record.key); else n.add(record.key); return n; })}
                onOpenProperty={onOpenProperty} onOpenPdf={(r) => void openPdf(r)} onRemove={(r) => void store.remove([r.key])} />
            ))}
          </Stack>
        )}
      </Stack>
    </Modal>
  );
}
