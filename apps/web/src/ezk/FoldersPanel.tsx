import { useState } from "react";
import { ActionIcon, Badge, Button, Collapse, Group, Paper, Stack, Text, TextInput, Tooltip, UnstyledButton } from "@mantine/core";
import { IconCheck, IconDeviceFloppy, IconFolder, IconFolderOpen, IconPencil, IconTrash, IconX } from "@tabler/icons-react";
import { useLiveQuery } from "dexie-react-hooks";
import { useI18n } from "../i18n";
import type { Folder, ResultsStore } from "./results";

interface Props { store: ResultsStore; currentCount: number }

type Pending = { id: string; action: "open" | "delete" | "overwrite" } | null;

/** Saved folders: named snapshots of the current results (owners, charges, PDFs). */
export function FoldersPanel({ store, currentCount }: Props) {
  const { t, lang } = useI18n();
  const folders = (useLiveQuery(() => store.listFolders(), [store]) ?? []) as Folder[];
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [note, setNote] = useState<string | null>(null);
  const df = new Intl.DateTimeFormat(lang === "sl" ? "sl-SI" : "en-GB", { dateStyle: "short", timeStyle: "short" });

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    try { await fn(); setNote(msg); } catch { setNote(t("folderError")); }
    setPending(null);
  };
  const confirmOr = (id: string, action: NonNullable<Pending>["action"], fn: () => void) =>
    pending?.id === id && pending.action === action ? fn() : setPending({ id, action });
  const armed = (id: string, action: NonNullable<Pending>["action"]) => pending?.id === id && pending.action === action;

  return (
    <Paper withBorder radius="md" p="xs" data-testid="folders">
      <Group justify="space-between" wrap="nowrap">
        <UnstyledButton onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <Group gap={6} wrap="nowrap">
            <IconFolder size={16} />
            <Text size="sm" fw={600}>{t("folders")}</Text>
            <Badge size="xs" variant="light">{folders.length}</Badge>
          </Group>
        </UnstyledButton>
        <Button size="xs" variant="light" leftSection={<IconDeviceFloppy size={14} />} disabled={!currentCount}
          onClick={() => { setOpen(true); setNewName(""); }}>{t("folderSave")}</Button>
      </Group>
      <Collapse in={open || newName !== null}>
        <Stack gap={6} mt={8}>
          {newName !== null && (
            <form onSubmit={(e) => { e.preventDefault(); const n = newName.trim(); if (n) void run(() => store.saveFolder(n), t("folderSaved")).then(() => setNewName(null)); }}>
              <Group gap={6} wrap="nowrap">
                <TextInput size="xs" autoFocus aria-label={t("folderName")} placeholder={t("folderName")} value={newName} onChange={(e) => setNewName(e.currentTarget.value)} style={{ flex: 1 }} maxLength={120} />
                <ActionIcon type="submit" color="teal" aria-label={t("save")} disabled={!newName.trim()}><IconCheck size={16} /></ActionIcon>
                <ActionIcon variant="subtle" color="gray" aria-label={t("cancel")} onClick={() => setNewName(null)}><IconX size={16} /></ActionIcon>
              </Group>
            </form>
          )}
          {!folders.length && newName === null && <Text size="xs" c="dimmed">{t("foldersEmpty")}</Text>}
          {folders.map((f) => (
            <Group key={f.id} justify="space-between" wrap="nowrap" gap={6} data-testid="folder-row" style={{ borderTop: "1px solid var(--mantine-color-default-border)", paddingTop: 6 }}>
              {renaming?.id === f.id ? (
                <form style={{ flex: 1 }} onSubmit={(e) => { e.preventDefault(); void run(() => store.renameFolder(f.id, renaming.name), t("folderRenamed")).then(() => setRenaming(null)); }}>
                  <Group gap={6} wrap="nowrap">
                    <TextInput size="xs" autoFocus aria-label={t("folderName")} value={renaming.name} onChange={(e) => setRenaming({ id: f.id, name: e.currentTarget.value })} style={{ flex: 1 }} maxLength={120} />
                    <ActionIcon type="submit" color="teal" aria-label={t("save")} disabled={!renaming.name.trim()}><IconCheck size={16} /></ActionIcon>
                    <ActionIcon variant="subtle" color="gray" aria-label={t("cancel")} onClick={() => setRenaming(null)}><IconX size={16} /></ActionIcon>
                  </Group>
                </form>
              ) : (
                <>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <Text size="sm" fw={600} truncate>{f.name}</Text>
                    <Text size="xs" c="dimmed">{f.count} {t("folderItems")} · {df.format(f.updatedAt)}</Text>
                  </div>
                  <Group gap={2} wrap="nowrap">
                    <Tooltip label={armed(f.id, "open") ? t("folderOpenConfirm") : t("folderOpen")} withinPortal>
                      <ActionIcon variant={armed(f.id, "open") ? "filled" : "subtle"} color="teal" aria-label={`${t("folderOpen")} ${f.name}`}
                        onClick={() => (currentCount ? confirmOr(f.id, "open", () => void run(() => store.openFolder(f.id), t("folderOpened"))) : void run(() => store.openFolder(f.id), t("folderOpened")))}>
                        <IconFolderOpen size={16} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label={armed(f.id, "overwrite") ? t("folderOverwriteConfirm") : t("folderOverwrite")} withinPortal>
                      <ActionIcon variant={armed(f.id, "overwrite") ? "filled" : "subtle"} color="blue" disabled={!currentCount} aria-label={`${t("folderOverwrite")} ${f.name}`}
                        onClick={() => confirmOr(f.id, "overwrite", () => void run(() => store.saveFolder(f.name, f.id), t("folderSaved")))}>
                        <IconDeviceFloppy size={16} />
                      </ActionIcon>
                    </Tooltip>
                    <ActionIcon variant="subtle" color="gray" aria-label={`${t("folderRename")} ${f.name}`} onClick={() => setRenaming({ id: f.id, name: f.name })}><IconPencil size={16} /></ActionIcon>
                    <Tooltip label={armed(f.id, "delete") ? t("folderDeleteConfirm") : t("folderDelete")} withinPortal>
                      <ActionIcon variant={armed(f.id, "delete") ? "filled" : "subtle"} color="red" aria-label={`${t("folderDelete")} ${f.name}`}
                        onClick={() => confirmOr(f.id, "delete", () => void run(() => store.deleteFolder(f.id), t("folderDeleted")))}>
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </>
              )}
            </Group>
          ))}
          {pending && <Text size="xs" c="orange" data-testid="folder-confirm">{t(pending.action === "open" ? "folderOpenConfirm" : pending.action === "delete" ? "folderDeleteConfirm" : "folderOverwriteConfirm")}</Text>}
          {note && <Text size="xs" c="teal" data-testid="folder-note">{note}</Text>}
        </Stack>
      </Collapse>
    </Paper>
  );
}
