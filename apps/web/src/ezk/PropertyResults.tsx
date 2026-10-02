import { useState } from "react";
import { Stack, Text } from "@mantine/core";
import { useI18n } from "../i18n";
import { ResultCard } from "./ResultCard";
import { useResults } from "./useResults";
import { resultsFor } from "./points";
import type { ResultRecord, ResultsStore } from "./results";

export async function openResultPdf(store: ResultsStore, r: ResultRecord) {
  const bytes = (await store.pdfs([r.key])).get(r.key);
  if (!bytes) return;
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

interface Props {
  kind: "parcel" | "building" | "part";
  ko: number;
  n: string | number;
  part?: number;
  /** Open the first card (single property). */
  defaultOpen?: boolean;
}

/** Land-registry extracts we already have for this property (shown in the details panels). */
export function PropertyResults({ kind, ko, n, part, defaultOpen }: Props) {
  const { t } = useI18n();
  const { store, records } = useResults();
  const mine = resultsFor(records, kind, ko, n, part)
    .sort((a, b) => (Number(a.extract.property.part ?? 0) - Number(b.extract.property.part ?? 0)));
  const [open, setOpen] = useState<Set<string> | null>(null);
  if (!mine.length) return null;
  const opened = open ?? new Set(defaultOpen && mine.length === 1 ? [mine[0].key] : []);
  const toggle = (k: string) => setOpen(() => { const s = new Set(opened); if (s.has(k)) s.delete(k); else s.add(k); return s; });
  return (
    <div data-testid="property-results">
      <Text size="xs" c="dimmed" tt="uppercase" fw={700} mt="md" mb={4}>{t("ezkInPanel")} ({mine.length})</Text>
      <Stack gap={6}>
        {mine.map((r) => (
          <ResultCard key={r.key} record={r} owners={r.extract.owners} open={opened.has(r.key)} onToggle={() => toggle(r.key)}
            onOpenPdf={r.hasPdf ? (x) => void openResultPdf(store, x) : undefined} onRemove={(x) => void store.remove([x.key])} />
        ))}
      </Stack>
    </div>
  );
}
