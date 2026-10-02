import { Checkbox, Group, Text, UnstyledButton } from "@mantine/core";
import { IconChevronDown, IconChevronRight, IconUser } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { useI18n } from "../../i18n";
import type { BuildingPart } from "../../gurs";
import { Chips, ownersLine } from "../../ezk/ResultCard";
import type { ResultRecord } from "../../ezk/results";

interface Props {
  part: BuildingPart;
  open: boolean;
  onToggle: () => void;
  inCart: boolean;
  picked: boolean;
  onPick: () => void;
  area: string | null;
  value: ReactNode;
  ezk?: ResultRecord;
  children?: ReactNode;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** One building part: number, use, area/floor, GURS value; owners + burdens when an eZK extract is stored. */
export function PartRow({ part: p, open, onToggle, inCart, picked, onPick, area, value, ezk, children }: Props) {
  const { t } = useI18n();
  const meta = [area, p.floor ? `${t("partFloor").toLowerCase()} ${p.floor}` : null].filter(Boolean).join(" · ");
  return (
    <div className="part-row" data-open={open || undefined} data-ezk={ezk ? "1" : undefined} data-testid="part-row" aria-expanded={open}>
      <div className="part-row-main">
        <div className="part-row-check">
          {inCart
            ? <Checkbox size="xs" checked disabled aria-label={`${t("inCart")} ${p.number}`} />
            : <Checkbox size="xs" checked={picked} onChange={onPick} aria-label={`${t("buildingPart")} ${p.number}`} />}
        </div>
        <UnstyledButton className="part-row-body" onClick={onToggle} aria-label={`${t("partDetails")} ${p.number}`}>
          <span className="part-no">{p.number}</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <Text size="sm" fw={500} truncate title={p.use ?? undefined}>{p.use ? cap(p.use) : "—"}</Text>
            {meta && <Text size="xs" c="dimmed">{meta}</Text>}
            {ezk && (
              <div className="part-owner" data-testid="part-owner">
                <Group gap={4} wrap="nowrap" style={{ minWidth: 0 }}>
                  <IconUser size={12} style={{ flexShrink: 0 }} />
                  <Text size="xs" fw={500} truncate>{ownersLine(ezk.extract.owners, t("ownerOf"))}</Text>
                </Group>
                <Chips record={ezk} size="xs" />
              </div>
            )}
          </div>
        </UnstyledButton>
        <div className="part-row-value">{value}</div>
        <UnstyledButton className="part-row-chevron" onClick={onToggle} aria-hidden tabIndex={-1}>
          {open ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
        </UnstyledButton>
      </div>
      {open && <div className="part-row-details" aria-label={t("partDetails")}>{children}</div>}
    </div>
  );
}
