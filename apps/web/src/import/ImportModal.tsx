import { useState } from "react";
import { Alert, Button, FileButton, Group, Modal, ScrollArea, Stack, Table, Text, Textarea } from "@mantine/core";
import { IconFileSpreadsheet, IconUpload } from "@tabler/icons-react";
import type { GursClient, Ko } from "../gurs";
import { useI18n, type MsgKey } from "../i18n";
import { useCart } from "../cart/useCart";
import { parseRows, splitText } from "./parse";
import { readFileRows } from "./readFile";
import { resolveImport, type InvalidRow } from "./resolve";

interface Props {
  opened: boolean;
  onClose: () => void;
  client: GursClient;
  kos: Ko[];
}

const REASON: Record<InvalidRow["reason"], MsgKey> = {
  malformed: "reasonMalformed", unknownKo: "reasonUnknownKo", duplicate: "reasonDuplicate",
  notFound: "reasonNotFound", serviceError: "reasonService",
};

export function ImportModal({ opened, onClose, client, kos }: Props) {
  const { t } = useI18n();
  const { store } = useCart();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ found: number; added: number; invalid: InvalidRow[]; file?: string } | null>(null);
  const mobile = typeof window !== "undefined" && window.innerWidth < 640;

  const run = async (rows: unknown[][], file?: string) => {
    setBusy(true);
    try {
      const res = await resolveImport(client, parseRows(rows, kos), kos);
      const added = await store.add(res.items);
      setResult({ found: res.items.length, added, invalid: res.invalid, file });
    } finally { setBusy(false); }
  };

  const close = () => { setResult(null); onClose(); };

  return (
    <Modal opened={opened} onClose={close} title={<Text fw={700}>{t("importTitle")}</Text>} size="lg" fullScreen={mobile}>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">{t("importHelp")}</Text>
        <Textarea
          aria-label={t("importPaste")} placeholder={"657;1587\nMARIBOR GRAD;31/8\n657 st:130\n657 del:130/2"}
          autosize minRows={5} maxRows={10} value={text} onChange={(e) => setText(e.currentTarget.value)}
          styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)" } }}
        />
        <Group justify="space-between" gap={6}>
          <FileButton accept=".csv,.txt,.tsv,.xlsx,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(f) => f && void readFileRows(f).then((rows) => run(rows, f.name))}>
            {(p) => <Button {...p} size="xs" variant="default" leftSection={<IconFileSpreadsheet size={14} />} disabled={busy || !kos.length}>{t("importFile")}</Button>}
          </FileButton>
          <Button size="xs" color="teal" leftSection={<IconUpload size={14} />} loading={busy} disabled={!text.trim() || !kos.length}
            onClick={() => void run(splitText(text))}>{t("importRun")}</Button>
        </Group>

        {result && (
          <Stack gap="xs" data-testid="import-result">
            <Alert color={result.found ? "teal" : "gray"} variant="light" p="xs">
              {result.file && <Text size="xs" c="dimmed">{result.file}</Text>}
              <Text size="sm">{t("importAdded")}: <b>{result.added}</b>{result.found !== result.added && ` (${result.found - result.added} ${t("importAlready")})`}</Text>
              {result.invalid.length > 0 && <Text size="sm">{t("importInvalid")}: <b>{result.invalid.length}</b></Text>}
            </Alert>
            {result.invalid.length > 0 && (
              <ScrollArea.Autosize mah={260} scrollbars="y">
                <Table fz="sm" striped layout="fixed" data-testid="import-invalid">
                  <Table.Thead><Table.Tr><Table.Th w={60}>{t("importLine")}</Table.Th><Table.Th>{t("importRow")}</Table.Th><Table.Th>{t("importReason")}</Table.Th></Table.Tr></Table.Thead>
                  <Table.Tbody>
                    {result.invalid.map((r) => (
                      <Table.Tr key={r.line}>
                        <Table.Td>{r.line}</Table.Td>
                        <Table.Td style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.raw}>{r.raw}</Table.Td>
                        <Table.Td>{t(REASON[r.reason])}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea.Autosize>
            )}
          </Stack>
        )}
      </Stack>
    </Modal>
  );
}
