import { act, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { I18nProvider } from '../i18n';
import { DATASET_BASE } from '../datasets/loader';
import { DataFreshness } from './DataFreshness';

afterEach(() => vi.unstubAllGlobals());
it('shows published snapshot dates using only metadata and the configured dataset base', async () => {
  const fetcher = vi.fn(async (url: string) => ({ ok: true, json: async () => ({ date: url.startsWith('/mirror') ? '2026-11-13' : '2026-11-14' }) }));
  vi.stubGlobal('fetch', fetcher);
  render(<MantineProvider><I18nProvider><DataFreshness /></I18nProvider></MantineProvider>);
  expect(await screen.findByText('Kataster: 2026-11-13')).toBeInTheDocument();
  expect(await screen.findByText('Vrednotenje: 2026-11-14')).toBeInTheDocument();
  expect(fetcher.mock.calls.map(c => c[0]).sort()).toEqual(['/mirror/index.json', `${DATASET_BASE}/index.json`, `${DATASET_BASE}/tx/index.json`].sort());
});
it('keeps unavailable dates unknown when metadata is missing, invalid, or offline', async () => {
  const fetcher = vi.fn(async (url: string) => {
    if (url.startsWith('/mirror')) throw new Error('offline');
    return { ok: !url.includes('/tx/'), json: async () => ({ date: '2026-02-31' }) };
  });
  vi.stubGlobal('fetch', fetcher);
  render(<MantineProvider><I18nProvider><DataFreshness /></I18nProvider></MantineProvider>);
  await act(async () => { await Promise.all(fetcher.mock.results.map(r => r.value).map(p => p.catch(() => undefined))); });
  expect(screen.getByText('Kataster: datum ni na voljo')).toBeInTheDocument();
  expect(screen.getByText('Vrednotenje: datum ni na voljo')).toBeInTheDocument();
  expect(screen.getByText('Prodaje in najemi (ETN): datum ni na voljo')).toBeInTheDocument();
});
