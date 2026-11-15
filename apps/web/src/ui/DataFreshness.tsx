import { useEffect, useState } from 'react';
import { Stack, Text } from '@mantine/core';
import { DATASET_BASE } from '../datasets/loader';
import { useI18n } from '../i18n';

const sources = [
  ['freshnessCadastre', '/mirror/index.json'],
  ['freshnessValues', `${DATASET_BASE.replace(/\/$/, '')}/index.json`],
  ['freshnessTx', `${DATASET_BASE.replace(/\/$/, '')}/tx/index.json`],
] as const;

/** Snapshot dates, not browser download times or promises of live freshness. No KO payloads needed. */
export function DataFreshness() {
  const { t } = useI18n();
  const [dates, setDates] = useState<(string | null)[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    sources.forEach(async ([, url], i) => {
      let date: string | null = null;
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (res.ok) {
          const json = await res.json();
          if (typeof json.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(json.date) && Number.isFinite(Date.parse(json.date)) && new Date(json.date).toISOString().slice(0, 10) === json.date) date = json.date;
        }
      } catch { /* Offline/missing metadata must not be replaced by today's date. */ }
      if (!controller.signal.aborted) setDates(old => { const next = [...old]; next[i] = date; return next; });
    });
    return () => controller.abort();
  }, []);
  return <Stack gap={2} mt="xs" data-testid="data-freshness">
    <Text size="xs" fw={700}>{t('dataAsOf')}</Text>
    {sources.map(([label], i) => <Text key={label} size="xs" c="dimmed">{t(label)}: {dates[i] ?? t('dateUnknown')}</Text>)}
  </Stack>;
}
