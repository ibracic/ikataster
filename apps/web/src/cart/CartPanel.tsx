import { useMemo, useState } from "react";
import { ActionIcon, Button, Group, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconFileImport, IconTrash, IconX } from "@tabler/icons-react";
import { useI18n } from "../i18n";
import type { CartItem } from "./store";
import { useDownloadList } from "../queue/useDownloadList";
import { ExtensionStatus } from "../bridge/ExtensionStatus";
import { QueuePanel } from "../queue/QueuePanel";
import { useGurs } from "../gurs/instance";
import { useKos } from "../gurs/useKos";

interface Props {
  onOpenItem?: (item: CartItem) => void;
  onImport?: () => void;
}

export const CART_PAGE = 200;

export function cartLabel(i: CartItem, t: (k: "parcel" | "building" | "buildingPart") => string) {
  if (i.kind === "part") return `${t("buildingPart")} ${i.number}/${i.part}`;
  return `${t(i.kind)} ${i.number}`;
}

/** Body of the extract to-do list: extension status, download queue, import, items. */
export function CartPanel({ onOpenItem, onImport }: Pick<Props, "onOpenItem" | "onImport">) {
  const { t } = useI18n();
  const { store, pending: items } = useDownloadList();
  const { kos } = useKos(useGurs());
  const names = useMemo(() => new Map(kos.map((k) => [k.id, k.name])), [kos]);
  const koName = (i: CartItem) => i.koName || names.get(i.koId) || "";
  const [confirm, setConfirm] = useState(false);
  // A manager's portfolio can put tens of thousands of items on the list: draw a page at a time.
  const [shown, setShown] = useState(CART_PAGE);

  return (
    <div data-testid="cart-panel">
      <div style={{ marginBottom: 12 }}><ExtensionStatus /></div>
      <div style={{ marginBottom: 12 }}><QueuePanel /></div>
      {onImport && (
        <Button size="xs" variant="light" leftSection={<IconFileImport size={14} />} mb="sm" onClick={onImport}>{t("importList")}</Button>
      )}
      {items.length === 0 ? (
        <Text c="dimmed" size="sm">{t("cartEmpty")}</Text>
      ) : (
        <Stack gap={4} data-testid="cart-list">
          {items.slice(0, shown).map((i) => (
            <Group key={i.key} justify="space-between" wrap="nowrap" gap={6} py={4} style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }}>
              <UnstyledButton onClick={() => onOpenItem?.(i)} style={{ minWidth: 0, flex: 1 }}>
                <Text size="sm" fw={600} truncate>{cartLabel(i, t)}</Text>
                <Text size="xs" c="dimmed" truncate>{t("ko")} {i.koId} {koName(i)}{i.note ? ` · ${i.note}` : ""}</Text>
              </UnstyledButton>
              <ActionIcon variant="subtle" color="gray" aria-label={`${t("remove")} ${cartLabel(i, t)}`} onClick={() => void store.remove([i.key])}>
                <IconX size={16} />
              </ActionIcon>
            </Group>
          ))}
          {items.length > shown && (
            <Button size="xs" variant="subtle" onClick={() => setShown((n) => n + CART_PAGE * 5)} data-testid="cart-more">
              {t("cartShowMore").replace("{n}", String(items.length - shown))}
            </Button>
          )}
          <Group justify="flex-end" mt="md">
            <Button
              size="xs" color="red" variant={confirm ? "filled" : "light"} leftSection={<IconTrash size={14} />}
              onClick={() => { if (confirm) { void store.clear(); setConfirm(false); } else setConfirm(true); }}
            >
              {confirm ? t("confirmClear") : t("clearCart")}
            </Button>
          </Group>
        </Stack>
      )}
    </div>
  );
}
