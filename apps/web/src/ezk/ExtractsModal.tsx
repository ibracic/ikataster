import { Modal, ScrollArea, Tabs, Text } from "@mantine/core";
import { IconFileText, IconUsers } from "@tabler/icons-react";
import { useI18n } from "../i18n";
import { useCart } from "../cart/useCart";
import { CartPanel } from "../cart/CartDrawer";
import type { CartItem } from "../cart/store";
import { useResults } from "./useResults";
import { ResultsPanel } from "./ResultsModal";
import type { ResultRecord } from "./results";

export type ExtractsTab = "todo" | "done";

interface Props {
  opened: boolean;
  tab: ExtractsTab;
  onTab: (tab: ExtractsTab) => void;
  onClose: () => void;
  onOpenItem?: (item: CartItem) => void;
  onImport?: () => void;
  onOpenProperty?: (r: ResultRecord) => void;
}

/** One place for land-registry extracts: what to download (to-do list) and what is already downloaded. */
export function ExtractsModal({ opened, tab, onTab, onClose, onOpenItem, onImport, onOpenProperty }: Props) {
  const { t } = useI18n();
  const { items } = useCart();
  const { records } = useResults();
  const mobile = typeof window !== "undefined" && window.innerWidth < 640;
  return (
    <Modal opened={opened} onClose={onClose} fullScreen={mobile} size="min(1100px, 96vw)"
      title={<Text fw={700}>{t("extractsTitle")}</Text>} scrollAreaComponent={ScrollArea.Autosize}
      styles={{ body: { overflowX: "hidden" } }}>
      <Tabs value={tab} onChange={(v) => v && onTab(v as ExtractsTab)} keepMounted={false}>
        <Tabs.List grow mb="sm">
          <Tabs.Tab value="todo" leftSection={<IconFileText size={14} />} data-testid="tab-todo">{t("extractsTodo")} ({items.length})</Tabs.Tab>
          <Tabs.Tab value="done" leftSection={<IconUsers size={14} />} data-testid="tab-done">{t("extractsDone")} ({records.length})</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="todo"><CartPanel onOpenItem={onOpenItem} onImport={onImport} /></Tabs.Panel>
        <Tabs.Panel value="done"><ResultsPanel onOpenProperty={onOpenProperty} /></Tabs.Panel>
      </Tabs>
    </Modal>
  );
}
