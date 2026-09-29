import { useState } from "react";
import { ActionIcon, Button, Drawer, Group, ScrollArea, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconFileImport, IconTrash, IconX } from "@tabler/icons-react";
import { useI18n } from "../i18n";
import type { CartItem } from "./store";
import { useCart } from "./useCart";
import { ExtensionStatus } from "../bridge/ExtensionStatus";
import { QueuePanel } from "../queue/QueuePanel";

interface Props {
  opened: boolean;
  onClose: () => void;
  onOpenItem?: (item: CartItem) => void;
  onImport?: () => void;
}

export function cartLabel(i: CartItem, t: (k: "parcel" | "building" | "buildingPart") => string) {
  if (i.kind === "part") return `${t("buildingPart")} ${i.number}/${i.part}`;
  return `${t(i.kind)} ${i.number}`;
}

export function CartDrawer({ opened, onClose, onOpenItem, onImport }: Props) {
  const { t } = useI18n();
  const { store, items } = useCart();
  const [confirm, setConfirm] = useState(false);
  const mobile = typeof window !== "undefined" && window.innerWidth < 640;

  return (
    <Drawer
      opened={opened} onClose={() => { setConfirm(false); onClose(); }}
      position={mobile ? "bottom" : "right"} size={mobile ? "70%" : 380}
      title={<Text fw={700}>{t("cart")} ({items.length})</Text>}
      scrollAreaComponent={ScrollArea.Autosize}
    >
      <div style={{ marginBottom: 12 }}><ExtensionStatus /></div>
      <div style={{ marginBottom: 12 }}><QueuePanel /></div>
      {onImport && (
        <Button size="xs" variant="light" leftSection={<IconFileImport size={14} />} mb="sm" onClick={onImport}>{t("importList")}</Button>
      )}
      {items.length === 0 ? (
        <Text c="dimmed" size="sm">{t("cartEmpty")}</Text>
      ) : (
        <Stack gap={4} data-testid="cart-list">
          {items.map((i) => (
            <Group key={i.key} justify="space-between" wrap="nowrap" gap={6} py={4} style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }}>
              <UnstyledButton onClick={() => onOpenItem?.(i)} style={{ minWidth: 0, flex: 1 }}>
                <Text size="sm" fw={600} truncate>{cartLabel(i, t)}</Text>
                <Text size="xs" c="dimmed" truncate>{t("ko")} {i.koId} {i.koName}{i.note ? ` · ${i.note}` : ""}</Text>
              </UnstyledButton>
              <ActionIcon variant="subtle" color="gray" aria-label={`${t("remove")} ${cartLabel(i, t)}`} onClick={() => void store.remove([i.key])}>
                <IconX size={16} />
              </ActionIcon>
            </Group>
          ))}
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
    </Drawer>
  );
}
