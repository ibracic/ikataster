import { ActionIcon, Menu } from "@mantine/core";
import { IconDots } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { useI18n } from "../i18n";

export type MoreAction = { label: string; icon: ReactNode; onClick?: () => void; href?: string; active?: boolean };

export function MoreActions({ actions }: { actions: MoreAction[] }) {
  const { t } = useI18n();
  return <Menu position="left-start" shadow="md" width={240} withinPortal>
    <Menu.Target>
      <ActionIcon size="lg" variant="default" radius="md" aria-label={t("more")}><IconDots size={18} /></ActionIcon>
    </Menu.Target>
    <Menu.Dropdown>
      {actions.map((a) => a.href
        ? <Menu.Item key={a.label} component="a" href={a.href} target="_blank" rel="noopener noreferrer" leftSection={a.icon}>{a.label}</Menu.Item>
        : <Menu.Item key={a.label} leftSection={a.icon} onClick={a.onClick} color={a.active ? "blue" : undefined}>{a.label}</Menu.Item>)}
    </Menu.Dropdown>
  </Menu>;
}
