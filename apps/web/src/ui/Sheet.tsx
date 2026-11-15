import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, UnstyledButton } from "@mantine/core";
import { IconArrowsMaximize, IconMap } from "@tabler/icons-react";
import { useI18n } from "../i18n";

/**
 * Mobile bottom-sheet state for detail panels. On phones a panel opens as a
 * "peek" (header, one-line summary, actions) so the map stays visible; tap or
 * swipe the handle up to expand, down to collapse. CSS (`.parcel-panel[data-sheet=peek]
 * .sheet-body`) hides the body only on narrow screens, so desktop is unaffected.
 */
export function useSheet(resetKey: unknown) {
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(false);
  useEffect(() => { setOpen(false); setFull(false); }, [resetKey]);
  const changeOpen = (v: boolean) => { setOpen(v); if (!v) setFull(false); };
  const changeFull = (v: boolean) => { setFull(v); setOpen(v); };
  return { open, setOpen: changeOpen, full, setFull: changeFull, attr: { "data-sheet": full ? "full" : open ? "open" : "peek" } as const };
}

export function SheetHandle({ open, setOpen, full, setFull }: { open: boolean; setOpen: (v: boolean) => void; full: boolean; setFull: (v: boolean) => void }) {
  const { t } = useI18n();
  const startY = useRef<number | null>(null);
  return (
    <div className="sheet-controls">
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
    <Button className="sheet-full-btn" variant="subtle" size="compact-sm" leftSection={full ? <IconMap size={16} /> : <IconArrowsMaximize size={16} />}
      onClick={() => setFull(!full)} aria-label={full ? t("sheetBackMap") : t("sheetFull")} aria-expanded={full}>
      {full ? t("sheetBackMap") : t("sheetFullShort")}
    </Button>
    </div>
  );
}

/** Compact one-line summary shown only in the mobile peek state. */
export function SheetSummary({ children }: { children: ReactNode }) {
  return <div className="sheet-summary">{children}</div>;
}
