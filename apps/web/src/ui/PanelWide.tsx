import { SETTINGS } from "../data/inventory";
import { useSyncExternalStore } from "react";
import { ActionIcon, Tooltip } from "@mantine/core";
import { IconArrowsMaximize, IconArrowsMinimize } from "@tabler/icons-react";
import { useI18n } from "../i18n";

/** Desktop: detail panels can be widened (remembered). The flag lives on <html data-panel-wide>, CSS does the rest. */
export const PANEL_WIDE_KEY = SETTINGS.panelWide;
const subs = new Set<() => void>();
const read = () => { try { return localStorage.getItem(PANEL_WIDE_KEY) === "1"; } catch { return false; } };
let wide = read();
const apply = () => { if (typeof document !== "undefined") document.documentElement.dataset.panelWide = wide ? "1" : "0"; };
apply();

export function setPanelWide(v: boolean) {
  wide = v;
  try { localStorage.setItem(PANEL_WIDE_KEY, v ? "1" : "0"); } catch { /* private mode */ }
  apply();
  subs.forEach((f) => f());
}
export function usePanelWide() {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => wide, () => false);
}

export function PanelWideToggle() {
  const { t } = useI18n();
  const on = usePanelWide();
  const label = t(on ? "panelNarrow" : "panelWide");
  return (
    <Tooltip label={label} withArrow>
      <ActionIcon className="panel-wide-btn" variant="subtle" color="gray" aria-label={label} aria-pressed={on} onClick={() => setPanelWide(!on)}>
        {on ? <IconArrowsMinimize size={16} /> : <IconArrowsMaximize size={16} />}
      </ActionIcon>
    </Tooltip>
  );
}
