import { useState } from "react";
import { ActionIcon, Button, Checkbox, Group, Menu, Paper, Text, TextInput, Tooltip } from "@mantine/core";
import { IconListCheck, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { fmt } from "./QuotaBadge";
import { useI18n } from "../i18n";
import type { ResultsStore, SavedList } from "./results";

interface Props {
  store: ResultsStore;
  lists: SavedList[];
  /** Currently shown list (filter), if any. */
  active: SavedList | null;
  onActive: (id: string | null) => void;
  visibleKeys: string[];
  selected: Set<string>;
  onSelected: (s: Set<string>) => void;
}

/** Bar for saved lists: select shown extracts, add them to a new or existing list, remove from the shown list. */
export function SavedLists({ store, lists, active, onActive, visibleKeys, selected, onSelected }: Props) {
  const { t } = useI18n();
  const [naming, setNaming] = useState<"new" | "rename" | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const chosen = visibleKeys.filter((k) => selected.has(k));
  const keys = chosen.length ? chosen : visibleKeys; // nothing ticked = everything shown
  const all = visibleKeys.length > 0 && chosen.length === visibleKeys.length;
  const done = (msg: string) => { setNote(msg); onSelected(new Set()); };
  const add = async (l: SavedList) => done(fmt(t("listAdded"), { n: await store.addToList(l.id, keys), name: l.name }));
  const save = async () => {
    if (!name.trim()) return;
    if (naming === "rename" && active) { await store.renameList(active.id, name); setNote(null); }
    else { const id = await store.createList(name, keys); done(fmt(t("listCreated"), { n: keys.length, name: name.trim() })); onActive(id); }
    setNaming(null); setName("");
  };
  return (
    <Paper withBorder radius="md" p="xs" data-testid="saved-lists">
      <Group gap="xs" wrap="wrap" justify="space-between">
        <Group gap="xs" wrap="wrap">
          <Checkbox size="sm" label={fmt(t("listSelectAll"), { n: visibleKeys.length })} checked={all} indeterminate={chosen.length > 0 && !all}
            onChange={() => onSelected(all ? new Set() : new Set(visibleKeys))} />
          <Menu position="bottom-start" withinPortal>
            <Menu.Target>
              <Button size="xs" variant="light" leftSection={<IconListCheck size={14} />} disabled={!visibleKeys.length}>
                {fmt(t(chosen.length ? "listAddSelected" : "listAddShown"), { n: keys.length })}
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconPlus size={14} />} onClick={() => { setNaming("new"); setName(""); }}>{t("listNew")}</Menu.Item>
              {lists.length > 0 && <Menu.Divider />}
              {lists.map((l) => <Menu.Item key={l.id} onClick={() => void add(l)}>{l.name} ({l.keys.length})</Menu.Item>)}
            </Menu.Dropdown>
          </Menu>
          {active && chosen.length > 0 && (
            <Button size="xs" variant="subtle" color="gray" onClick={() => void store.removeFromList(active.id, chosen).then(() => done(t("listRemoved")))}>
              {fmt(t("listRemoveSelected"), { n: chosen.length })}
            </Button>
          )}
        </Group>
        {active && (
          <Group gap={4}>
            <Tooltip label={t("listRename")}><ActionIcon variant="subtle" aria-label={t("listRename")} onClick={() => { setNaming("rename"); setName(active.name); }}><IconPencil size={16} /></ActionIcon></Tooltip>
            <Tooltip label={confirmDelete ? t("listDeleteConfirm") : t("listDelete")}>
              <ActionIcon variant={confirmDelete ? "filled" : "subtle"} color="red" aria-label={t("listDelete")}
                onClick={() => { if (!confirmDelete) { setConfirmDelete(true); return; } setConfirmDelete(false); onActive(null); void store.deleteList(active.id); }}>
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        )}
      </Group>
      {naming && (
        <Group gap="xs" mt="xs" wrap="nowrap">
          <TextInput size="xs" style={{ flex: 1 }} autoFocus label={t("listName")} placeholder={t("listNamePlaceholder")} value={name}
            onChange={(e) => setName(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === "Enter") void save(); }} />
          <Button size="xs" mt={22} disabled={!name.trim()} onClick={() => void save()}>{t("listSave")}</Button>
          <Button size="xs" mt={22} variant="subtle" color="gray" onClick={() => setNaming(null)}>{t("cancel")}</Button>
        </Group>
      )}
      {note && <Text size="xs" c="teal" mt={6} data-testid="list-note">{note}</Text>}
    </Paper>
  );
}
