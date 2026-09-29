import { valuesInstance } from "../values";
import { txInstance } from "../transactions";
import { cacheStore } from "../cache/instance";
import { useEffect, useState } from "react";
import { Accordion, Alert, Badge, Button, FileButton, Group, Loader, Modal, Paper, Progress, SimpleGrid, Stack, Text, ThemeIcon } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconAlertTriangle, IconCloudOff, IconDatabaseExport, IconDownload, IconSettings, IconShieldCheck, IconTrash, IconUpload } from "@tabler/icons-react";
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

export const LAST_BACKUP_KEY = "ikataster.lastBackup";

const browserDownload = (bytes: Uint8Array, name: string) => {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/zip" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};

export function DataModal({ opened, onClose, download = browserDownload, onRestored = () => window.location.reload() }: Props) {
  const { t, lang } = useI18n();
  const mobile = useMediaQuery("(max-width: 640px)") ?? false;
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
    try { const r = await exportBackup(dbs); download(r.zip, r.fileName); localStorage.setItem(LAST_BACKUP_KEY, String(Date.now())); setMsg({ color: "teal", text: t("backupDone") }); }
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

  const lastBackup = Number(localStorage.getItem(LAST_BACKUP_KEY) ?? 0) || null;
  const ago = (ts: number) => {
    const d = Math.floor((Date.now() - ts) / 86_400_000);
    return d <= 0 ? t("today") : d === 1 ? t("yesterday") : t("daysAgo").replace("{n}", String(d));
  };
  const stat = (label: string, value: number, id: string) => (
    <Paper withBorder radius="md" p="xs" ta="center" data-testid={id}>
      <Text fw={700} size="lg" lh={1.1}>{value}</Text>
      <Text size="xs" c="dimmed">{label}</Text>
    </Paper>
  );
  const section = (icon: React.ReactNode, title: string, help: string, body: React.ReactNode, extra?: React.ReactNode) => (
    <Paper withBorder radius="md" p="sm">
      <Group gap={8} wrap="nowrap" align="flex-start" mb={8}>
        <ThemeIcon variant="light" size="md" radius="md">{icon}</ThemeIcon>
        <div style={{ minWidth: 0, flex: 1 }}>
          <Group justify="space-between" gap={6}><Text fw={600} size="sm">{title}</Text>{extra}</Group>
          <Text size="xs" c="dimmed">{help}</Text>
        </div>
      </Group>
      {body}
    </Paper>
  );

  return (
    <Modal opened={opened} onClose={onClose} title={<Text fw={700}>{t("dataTitle")}</Text>} size="lg" fullScreen={mobile}
      radius={mobile ? 0 : "md"} transitionProps={mobile ? { transition: "slide-up" } : undefined}>
      <Stack gap="sm">
        <Text size="xs" c="dimmed">{t("dataHelp")}</Text>

        {msg && <Alert color={msg.color} variant="light" p="xs" data-testid="data-msg" withCloseButton onClose={() => setMsg(null)}>{msg.text}</Alert>}

        <Stack gap={6} data-testid="data-storage">
          <SimpleGrid cols={3} spacing="xs" data-testid="data-counts">
            {stat(t("statList"), items.length, "count-cart")}
            {stat(t("statResults"), records.length, "count-results")}
            {stat(t("folders"), folders, "count-folders")}
          </SimpleGrid>
          {info?.supported && (
            <Group gap={8} wrap="nowrap">
              <Progress value={pct} size="sm" color={pct > 80 ? "orange" : "teal"} aria-label={t("storageUsed")} style={{ flex: 1 }} />
              <Text size="xs" c="dimmed" data-testid="storage-usage" style={{ whiteSpace: "nowrap" }}>{mb(info.usage)} / {mb(info.quota)}</Text>
            </Group>
          )}
          <Group gap={6} wrap="nowrap" justify="space-between">
            <Group gap={4} wrap="nowrap" style={{ minWidth: 0 }}>
              {info?.persisted ? <IconShieldCheck size={16} color="var(--mantine-color-teal-6)" /> : <IconAlertTriangle size={16} color={info?.supported ? "var(--mantine-color-orange-6)" : "var(--mantine-color-gray-6)"} />}
              <Text size="xs" data-testid="persist-state" title={info?.supported && !info.persisted ? t("persistNoHint") : undefined}>
                {info == null ? "…" : !info.supported ? t("persistUnsupported") : info.persisted ? t("persistYes") : t("persistNo")}
              </Text>
            </Group>
            {info?.supported && !info.persisted && (
              <Button size="compact-xs" variant="subtle" loading={busy === "persist"}
                onClick={async () => { setBusy("persist"); await ensurePersisted(undefined, undefined, true); setBusy(null); refresh(); }}>{t("persistAskShort")}</Button>
            )}
          </Group>
        </Stack>

        {section(<IconDatabaseExport size={18} />, t("backupTitle"), t("backupHelpShort"), (
          <Stack gap={8}>
            <SimpleGrid cols={2} spacing="xs">
              <Button size="sm" leftSection={busy === "backup" ? <Loader size={14} color="white" /> : <IconDownload size={16} />} disabled={!!busy} onClick={() => void doBackup()}>{t("backupDownload")}</Button>
              <FileButton accept=".zip,.json,application/zip,application/json" onChange={(f) => void onFile(f)}>
                {(p) => <Button {...p} size="sm" variant="light" leftSection={busy === "read" ? <Loader size={14} /> : <IconUpload size={16} />} disabled={!!busy}>{t("restoreChoose")}</Button>}
              </FileButton>
            </SimpleGrid>
            {pendingSummary && (
              <Alert color="orange" variant="light" p="xs" data-testid="restore-confirm">
                <Text size="sm" fw={500}>{t("restoreConfirm")}</Text>
                <Text size="xs" c="dimmed" mt={4}>
                  {new Date(pendingSummary.createdAt).toLocaleString(lang === "sl" ? "sl-SI" : "en-GB")} · {t("statList")}: {pendingSummary.tables["cart.items"] ?? 0} · {t("statResults")}: {pendingSummary.tables["results.results"] ?? 0} · PDF: {pendingSummary.tables["results.pdfs"] ?? 0} · {t("folders")}: {pendingSummary.tables["results.folders"] ?? 0}
                </Text>
                <Group gap="xs" mt="xs">
                  <Button size="xs" color="red" loading={busy === "restore"} onClick={() => void doRestore()}>{t("restoreReplace")}</Button>
                  <Button size="xs" variant="default" onClick={() => setPending(null)}>{t("cancel")}</Button>
                </Group>
              </Alert>
            )}
          </Stack>
        ), <Badge size="xs" variant="light" color={lastBackup && Date.now() - lastBackup < 7 * 86_400_000 ? "teal" : "orange"} data-testid="last-backup">
          {lastBackup ? `${t("lastBackup")}: ${ago(lastBackup)}` : t("neverBackedUp")}
        </Badge>)}

        {section(<IconCloudOff size={18} />, t("pinTitle"), t("pinHelpShort"), <PinsSection hideTitle onMessage={(color, text) => setMsg({ color, text })} />)}

        <Accordion variant="contained" radius="md" chevronPosition="right">
          <Accordion.Item value="adv">
            <Accordion.Control icon={<IconSettings size={16} />}><Text size="sm" fw={600}>{t("advanced")}</Text></Accordion.Control>
            <Accordion.Panel>
              <Stack gap={6}>
                <Text size="sm" fw={500}>{t("cachesTitle")}</Text>
                <Text size="xs" c="dimmed">{t("cachesHelp")}</Text>
                <Group>
                  <Button size="xs" variant="default" leftSection={<IconTrash size={14} />} loading={busy === "clear"}
                    onClick={async () => { setBusy("clear"); const n = await clearCaches(undefined, cacheStore); await valuesInstance().clear().catch(() => undefined); await txInstance().clear().catch(() => undefined); setBusy(null); setMsg({ color: "teal", text: `${t("cachesCleared")} (${n})` }); refresh(); }}>{t("cachesClear")}</Button>
                </Group>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </Stack>
    </Modal>
  );
}
