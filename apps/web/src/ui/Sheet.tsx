import { useEffect, useRef, useState, type ReactNode } from "react";
import { UnstyledButton } from "@mantine/core";
import { useI18n } from "../i18n";

/**
 * Mobile bottom-sheet state for detail panels. On phones a panel opens as a
 * "peek" (header, one-line summary, actions) so the map stays visible; tap or
 * swipe the handle up to expand, down to collapse. CSS (`.parcel-panel[data-sheet=peek]
 * .sheet-body`) hides the body only on narrow screens, so desktop is unaffected.
 */
export function useSheet(resetKey: unknown) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [resetKey]);
  return { open, setOpen, attr: { "data-sheet": open ? "open" : "peek" } as const };
}

export function SheetHandle({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const { t } = useI18n();
  const startY = useRef<number | null>(null);
  return (
    <UnstyledButton
      className="sheet-handle" aria-label={open ? t("sheetCollapse") : t("sheetExpand")} aria-expanded={open}
      onClick={() => setOpen(!open)}
      onTouchStart={(e) => { startY.current = e.touches[0].clientY; }}
      onTouchEnd={(e) => {
        if (startY.current == null) return;
        const dy = e.changedTouches[0].clientY - startY.current;
        startY.current = null;
        if (dy < -24) { e.preventDefault(); setOpen(true); }
        else if (dy > 24) { e.preventDefault(); setOpen(false); }
      }}
    >
      <span />
    </UnstyledButton>
  );
}

/** Compact one-line summary shown only in the mobile peek state. */
export function SheetSummary({ children }: { children: ReactNode }) {
  return <div className="sheet-summary">{children}</div>;
}
