import { Group, Stack, Text, Tooltip } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { useI18n } from "../i18n";
import type { Comparables } from "./comparables";

const fmtDate = (d: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d); return m ? `${+m[2]}/${m[1]}` : d; };

/** Median €/m² of comparable sales, an estimate for this property and the closest matches. */
export function ComparablesBlock({ data }: { data: Comparables | null }) {
  const { t, lang } = useI18n();
  if (!data) return null;
  const loc = lang === "sl" ? "sl-SI" : "en-GB";
  const eur = (v: number) => new Intl.NumberFormat(loc, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
  const num = (v: number) => new Intl.NumberFormat(loc, { maximumFractionDigits: 1 }).format(v);
  return (
    <div data-testid="comparables">
      <Group gap={4} mt="sm" mb={4}>
        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>{t("compTitle")} ({data.count})</Text>
        <Tooltip label={t("compBasis")} multiline w={260} withArrow events={{ hover: true, focus: true, touch: true }}>
          <IconInfoCircle size={14} color="var(--mantine-color-dimmed)" />
        </Tooltip>
      </Group>
      <Group gap="lg" mb={6}>
        <div>
          <Text size="xs" c="dimmed">{t("compMedian")}</Text>
          <Text fw={700} data-testid="comp-median">{eur(data.medianPerM2)}/m²</Text>
        </div>
        {data.estimate != null && (
          <div>
            <Text size="xs" c="dimmed">{t("compEstimate")}</Text>
            <Text fw={700} data-testid="comp-estimate">≈ {eur(data.estimate)}</Text>
          </div>
        )}
      </Group>
      <Stack gap={2} pr={10}>
        {data.items.map((c) => (
          <Group key={`${c.key}-${c.date}`} justify="space-between" gap={4} data-testid="comp-row">
            <Text size="sm" style={{ whiteSpace: "nowrap" }}>{fmtDate(c.date)} · {num(c.area)} m² · <Text span c="dimmed" size="sm">{c.key}</Text></Text>
            <Text size="sm" style={{ whiteSpace: "nowrap" }}>{eur(c.price)} <Text span c="dimmed" size="xs">({eur(c.perM2)}/m²)</Text></Text>
          </Group>
        ))}
      </Stack>
    </div>
  );
}
