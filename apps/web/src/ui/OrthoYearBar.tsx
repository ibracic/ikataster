import { ActionIcon, Group, Paper, Slider, Stack, Text } from "@mantine/core";
import { IconChevronLeft, IconChevronRight, IconX } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { ORTHO_YEARS, orthoYearWindow } from "../map/layers";

/** Floating year slider for the historical orthophoto; the map only reloads when dragging ends. */
export function OrthoYearBar({ year, onChange, onClose }: { year: number; onChange: (y: number) => void; onClose: () => void }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(year);
  useEffect(() => setDraft(year), [year]);
  const i = ORTHO_YEARS.indexOf(year);
  const first = ORTHO_YEARS[0], last = ORTHO_YEARS[ORTHO_YEARS.length - 1];
  return (
    <Paper shadow="md" radius="md" p="xs" data-testid="ortho-year-bar" className="ortho-year-bar">
      <Stack gap={4}>
        <Group gap={6} wrap="nowrap" justify="space-between">
          <Text size="xs" fw={700} c="dimmed" tt="uppercase">{t("orthoHistory")}</Text>
          <ActionIcon size="sm" variant="subtle" color="gray" aria-label={t("orthoHistoryClose")} onClick={onClose}><IconX size={14} /></ActionIcon>
        </Group>
        <Group gap={6} wrap="nowrap">
          <ActionIcon variant="default" aria-label={t("orthoPrev")} disabled={i <= 0} onClick={() => onChange(ORTHO_YEARS[i - 1])}><IconChevronLeft size={16} /></ActionIcon>
          <Text fw={700} size="lg" w={48} ta="center" data-testid="ortho-year">{draft}</Text>
          <ActionIcon variant="default" aria-label={t("orthoNext")} disabled={i >= ORTHO_YEARS.length - 1} onClick={() => onChange(ORTHO_YEARS[i + 1])}><IconChevronRight size={16} /></ActionIcon>
          <Slider
            style={{ flex: 1, marginRight: 14 }} min={first} max={last} step={1} value={draft} label={null} aria-label={t("orthoYear")}
            marks={[{ value: 1990, label: "1990" }, { value: 2000, label: "2000" }, { value: 2010, label: "2010" }, { value: 2025, label: "2025" }]}
            onChange={(v) => setDraft(orthoYearWindow(v))}
            onChangeEnd={(v) => onChange(orthoYearWindow(v))}
          />
        </Group>
        <Text size="xs" c="dimmed" mt={10}>{t("orthoYearHint")}</Text>
      </Stack>
    </Paper>
  );
}
