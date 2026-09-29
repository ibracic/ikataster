import { useState, useRef } from "react";
import { ActionIcon, Button, Group, Progress, Select, Stack, Table, Text, Title, Tooltip } from "@mantine/core";
import { IconPin, IconRefresh, IconTrash, IconX } from "@tabler/icons-react";
import { useLiveQuery } from "dexie-react-hooks";
import { useGurs } from "../gurs/instance";
import { useKos } from "../gurs/useKos";
import type { KoDownloadPhase } from "../gurs";
import { useI18n } from "../i18n";
import { useOffline } from "./instance";
import { pinKo } from "./pins";

const mb = (b: number) => `${(b / 1_048_576).toFixed(1).replace(".", ",")} MB`;

/** Pin KOs for offline lookups: choose, download with progress/cancel, list with size, refresh, remove. */
export function PinsSection({ onMessage }: { onMessage: (color: string, text: string) => void }) {
  const { t, lang } = useI18n();
  const gurs = useGurs();
  const store = useOffline();
  const { kos } = useKos(gurs);
  const pins = useLiveQuery(() => store.listPins(), [store]) ?? [];
  const [ko, setKo] = useState<string | null>(null);
  const [run, setRun] = useState<{ koId: number; phase: KoDownloadPhase; done: number; total: number } | null>(null);
  const ctl = useRef<AbortController | null>(null);

  const pin = async (koId: number) => {
    const c = new AbortController(); ctl.current = c;
    setRun({ koId, phase: "parcels", done: 0, total: 0 });
    try {
      const p = await pinKo(gurs, store, koId, { signal: c.signal, onProgress: (phase, done, total) => setRun({ koId, phase, done, total }) });
      onMessage("teal", `${t("pinDone")}: ${p.koId} ${p.name}`);
      setKo(null);
    } catch (e) {
      onMessage(c.signal.aborted ? "gray" : "red", c.signal.aborted ? t("pinCancelled") : `${t("pinFailed")}: ${(e as Error).message}`);
    } finally { setRun(null); ctl.current = null; }
  };
  const phaseLabel: Record<KoDownloadPhase, string> = { parcels: t("parcels"), buildings: t("buildings"), outlines: t("pinOutlines"), parts: t("pinParts") };

  return (
    <Stack gap={6} data-testid="pins">
      <Title order={3} size="h6">{t("pinTitle")}</Title>
      <Text size="xs" c="dimmed">{t("pinHelp")}</Text>
      <Group gap="xs" align="flex-end" wrap="nowrap">
        <Select
          style={{ flex: 1 }} size="sm" searchable clearable limit={50} placeholder={t("koPlaceholder")} aria-label={t("pinKo")}
          data={kos.map((k) => ({ value: String(k.id), label: `${k.id} ${k.name}` }))} value={ko} onChange={setKo} disabled={!!run}
          comboboxProps={{ withinPortal: true }}
        />
        <Button size="sm" leftSection={<IconPin size={16} />} disabled={!ko || !!run} onClick={() => ko && void pin(Number(ko))}>{t("pinKo")}</Button>
      </Group>
      {run && (
        <Stack gap={2} data-testid="pin-progress">
          <Group justify="space-between">
            <Text size="xs">{run.koId} · {phaseLabel[run.phase]}: {run.done}{run.total ? ` / ${run.total}` : ""}</Text>
            <Button size="compact-xs" variant="subtle" color="gray" leftSection={<IconX size={12} />} onClick={() => ctl.current?.abort()}>{t("cancel")}</Button>
          </Group>
          <Progress size="sm" value={run.total ? (run.done / run.total) * 100 : 5} animated />
        </Stack>
      )}
      {pins.length > 0 && (
        <Table fz="xs" verticalSpacing={4} data-testid="pin-list">
          <Table.Tbody>
            {pins.map((p) => (
              <Table.Tr key={p.koId}>
                <Table.Td><Text size="xs" fw={600}>{p.koId} {p.name}</Text>
                  <Text size="xs" c="dimmed">{p.parcels} {t("parcels").toLowerCase()} · {p.buildings} {t("buildings").toLowerCase()} · {p.parts} {t("pinParts").toLowerCase()} · {mb(p.bytes)} · {new Date(p.pinnedAt).toLocaleDateString(lang === "sl" ? "sl-SI" : "en-GB")}</Text></Table.Td>
                <Table.Td w={70}>
                  <Group gap={2} wrap="nowrap">
                    <Tooltip label={t("pinRefresh")}><ActionIcon size="sm" variant="subtle" aria-label={`${t("pinRefresh")} ${p.koId}`} disabled={!!run} onClick={() => void pin(p.koId)}><IconRefresh size={14} /></ActionIcon></Tooltip>
                    <Tooltip label={t("pinRemove")}><ActionIcon size="sm" variant="subtle" color="red" aria-label={`${t("pinRemove")} ${p.koId}`} disabled={!!run} onClick={() => void store.removePin(p.koId)}><IconTrash size={14} /></ActionIcon></Tooltip>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
