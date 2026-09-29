import { valuesInstance } from "../values";
import { txInstance } from "../transactions";
import { cacheStore } from "../cache/instance";
import { useEffect, useState } from "react";
import { Alert, Badge, Button, FileButton, Group, Loader, Modal, Progress, Stack, Text, Title } from "@mantine/core";
import { IconDatabaseExport, IconDatabaseImport, IconLock, IconTrash } from "@tabler/icons-react";
import { useLiveQuery } from "dexie-react-hooks";
import { useI18n } from "../i18n";
import { useCart } from "../cart/useCart";
import { useResults } from "../ezk/useResults";
import { BackupError, exportBackup, readBackup, restoreBackup, summarize, type BackupData } from "./backup";
import { PinsSection } from "../offline/PinsSection";
import { useOffline } from "../offline/instance";
import { queueStore } from "../queue/instance";
import { clearCaches, ensurePersisted, storageInfo, type StorageInfo } from "./storage";

interface Props {
  opened: boolean;
  onClose: () => void;
  download?: (bytes: Uint8Array, name: string) => void;
  /** After restore; default reloads the page so settings (language, theme) apply. */
  onRestored?: () => void;
}

const browserDownload = (bytes: Uint8Array, name: string) => {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/zip" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};

export function DataModal({ opened, onClose, download = browserDownload, onRestored = () => window.location.reload() }: Props) {
  const { t, lang } = useI18n();
  const { store: cart, items } = useCart();
  const { store: results, records } = useResults();
  const folders = useLiveQuery(() => results.db.folders.count(), [results]) ?? 0;
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [busy, setBusy] = useState<null | "backup" | "read" | "restore" | "persist" | "clear">(null);
  const [pending, setPending] = useState<BackupData | null>(null);
  const [msg, setMsg] = useState<{ color: string; text: string } | null>(null);
  const nf = new Intl.NumberFormat(lang === "sl" ? "sl-SI" : "en-GB", { maximumFractionDigits: 1 });
  const mb = (b: number | null) => (b == null ? "?" : `${nf.format(b / 1024 / 1024)} MB`);
  const offline = useOffline();
  const dbs = { cart: cart.db, results: results.db, gurs: offline.db, queue: queueStore.db };

  const refresh = () => void storageInfo().then(setInfo);
  useEffect(() => { if (opened) { refresh(); setMsg(null); setPending(null); } }, [opened]);

  const doBackup = async () => {
    setBusy("backup"); setMsg(null);
    try { const r = await exportBackup(dbs); download(r.zip, r.fileName); setMsg({ color: "teal", text: t("backupDone") }); }
    catch { setMsg({ color: "red", text: t("backupFailed") }); }
    setBusy(null);
  };
  const onFile = async (f: File | null) => {
    if (!f) return;
    setBusy("read"); setMsg(null); setPending(null);
    try { setPending(readBackup(new Uint8Array(await f.arrayBuffer()))); }
    catch (e) { setMsg({ color: "red", text: t(e instanceof BackupError && e.reason === "newer-version" ? "restoreNewer" : "restoreInvalid") }); }
    setBusy(null);
  };
  const doRestore = async () => {
    if (!pending) return;
    setBusy("restore");
    try { await restoreBackup(pending, dbs); setPending(null); setMsg({ color: "teal", text: t("restoreDone") }); onRestored(); }
    catch { setMsg({ color: "red", text: t("restoreFailed") }); }
    setBusy(null); refresh();
  };
  const pendingSummary = pending ? summarize(pending) : null;
  const pct = info?.usage != null && info.quota ? Math.min(100, (info.usage / info.quota) * 100) : 0;

  return (
    <Modal opened={opened} onClose={onClose} title={<Text fw={700}>{t("dataTitle")}</Text>} size="lg">
      <Stack gap="md">
        <Text size="sm" c="dimmed">{t("dataHelp")}</Text>

        <Stack gap={6} data-testid="data-storage">
          <Title order={3} size="h6">{t("storageTitle")}</Title>
          <Group gap="xs">
            <Badge color={info?.persisted ? "teal" : info?.supported ? "orange" : "gray"} leftSection={<IconLock size={12} />} data-testid="persist-state">
              {info == null ? "…" : !info.supported ? t("persistUnsupported") : info.persisted ? t("persistYes") : t("persistNo")}
            </Badge>
            {info?.supported && !info.persisted && (
              <Button size="xs" variant="light" loading={busy === "persist"}
                onClick={async () => { setBusy("persist"); await ensurePersisted(undefined, undefined, true); setBusy(null); refresh(); }}>{t("persistAsk")}</Button>
            )}
          </Group>
          {info?.supported && !info.persisted && <Text size="xs" c="dimmed">{t("persistNoHint")}</Text>}
          {info?.supported && (
            <>
              <Progress value={pct} size="sm" color={pct > 80 ? "orange" : "teal"} aria-label={t("storageUsed")} />
              <Text size="xs" c="dimmed" data-testid="storage-usage">{t("storageUsed")}: {mb(info.usage)} / {mb(info.quota)}</Text>
            </>
          )}
          <Text size="xs" data-testid="data-counts">{t("cart")}: {items.length} · {t("results")}: {records.length} · {t("folders")}: {folders}</Text>
        </Stack>

        <Stack gap={6}>
          <Title order={3} size="h6">{t("backupTitle")}</Title>
          <Text size="xs" c="dimmed">{t("backupHelp")}</Text>
          <Group gap="xs">
            <Button size="sm" leftSection={busy === "backup" ? <Loader size={14} /> : <IconDatabaseExport size={16} />} disabled={!!busy} onClick={() => void doBackup()}>{t("backupDownload")}</Button>
            <FileButton accept=".zip,.json,application/zip,application/json" onChange={(f) => void onFile(f)}>
              {(p) => <Button {...p} size="sm" variant="light" leftSection={busy === "read" ? <Loader size={14} /> : <IconDatabaseImport size={16} />} disabled={!!busy}>{t("restoreChoose")}</Button>}
            </FileButton>
          </Group>
          {pendingSummary && (
            <Alert color="orange" variant="light" p="xs" data-testid="restore-confirm">
              <Text size="sm">{t("restoreConfirm")}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {new Date(pendingSummary.createdAt).toLocaleString(lang === "sl" ? "sl-SI" : "en-GB")} · {t("cart")}: {pendingSummary.tables["cart.items"] ?? 0} · {t("results")}: {pendingSummary.tables["results.results"] ?? 0} · PDF: {pendingSummary.tables["results.pdfs"] ?? 0} · {t("folders")}: {pendingSummary.tables["results.folders"] ?? 0}
              </Text>
              <Group gap="xs" mt="xs">
                <Button size="xs" color="red" loading={busy === "restore"} onClick={() => void doRestore()}>{t("restoreReplace")}</Button>
                <Button size="xs" variant="default" onClick={() => setPending(null)}>{t("cancel")}</Button>
              </Group>
            </Alert>
          )}
        </Stack>

        <PinsSection onMessage={(color, text) => setMsg({ color, text })} />

        <Stack gap={6}>
          <Title order={3} size="h6">{t("cachesTitle")}</Title>
          <Text size="xs" c="dimmed">{t("cachesHelp")}</Text>
          <Group>
            <Button size="xs" variant="default" leftSection={<IconTrash size={14} />} loading={busy === "clear"}
              onClick={async () => { setBusy("clear"); const n = await clearCaches(undefined, cacheStore); await valuesInstance().clear().catch(() => undefined); await txInstance().clear().catch(() => undefined); setBusy(null); setMsg({ color: "teal", text: `${t("cachesCleared")} (${n})` }); refresh(); }}>{t("cachesClear")}</Button>
          </Group>
        </Stack>

        {msg && <Alert color={msg.color} variant="light" p="xs" data-testid="data-msg" withCloseButton onClose={() => setMsg(null)}>{msg.text}</Alert>}
      </Stack>
    </Modal>
  );
}
