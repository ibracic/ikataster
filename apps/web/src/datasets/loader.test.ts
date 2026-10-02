import Dexie from 'dexie';
import { expect, it, vi } from 'vitest';
import { createValues } from '../values';
import { createTransactions } from '../transactions';
import { DATASET_TTL } from './loader';

it.each([['values', createValues], ['transactions', createTransactions]] as const)('%s preserves cache policy across instances', async (kind, create) => {
  const name = `dataset-${kind}-${Date.now()}`;
  let now = 1000;
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ ko:999,date:'2026-01-01',p:{},d:{},s:{},sd:{},sp:{},r:{},rd:{} })));
  const opts = { name, fetch: fetcher as typeof fetch, now: () => now };
  const loader = create(opts);
  try {
    const [a,b] = await Promise.all([loader.get(999),loader.get(999)]);
    expect(a).toEqual(b); expect(fetcher).toHaveBeenCalledTimes(1);
    const reopened = create(opts);
    expect(await reopened.get(999)).toEqual(a);
    expect(fetcher).toHaveBeenCalledTimes(1);
    now += DATASET_TTL + 1;
    fetcher.mockImplementation(async () => { throw new Error('offline'); });
    expect(await reopened.get(999)).toEqual(a);
    await reopened.clear();
    await expect(reopened.get(999)).rejects.toThrow('offline');
    fetcher.mockImplementation(async () => new Response('', { status:404 }));
    expect(await reopened.get(999)).toBeNull();
    const calls = fetcher.mock.calls.length;
    expect(await create(opts).get(999)).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(calls);
  } finally { await Dexie.delete(name); }
});
