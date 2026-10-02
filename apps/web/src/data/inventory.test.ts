import { expect, it, vi } from 'vitest';
import { clearCaches } from './storage';
it('cache clearing leaves unrelated origin caches and user settings alone', async () => {
  const del = vi.fn(async (_key: string) => true);
  vi.stubGlobal('caches', { keys: async () => ['another-app', 'ikataster-gurs-data-v1'], delete: del });
  localStorage.setItem('ikataster.lang', 'sl');
  localStorage.setItem('ikataster.kos.v1', 'cached');
  try {
    await clearCaches(localStorage);
    expect(del.mock.calls.map(c => c[0])).toEqual(['ikataster-gurs-data-v1']);
    expect(localStorage.getItem('ikataster.lang')).toBe('sl');
    expect(localStorage.getItem('ikataster.kos.v1')).toBeNull();
  } finally { vi.unstubAllGlobals(); localStorage.clear(); }
});

import { storageInventory } from './inventory';
import { createCartStore } from '../cart/store';
import { createResultsStore } from '../ezk/results';
import { createQueueStore } from '../queue/store';
import { createGursStore } from '../local/db';
import { exportBackup, readBackup, restoreBackup } from './backup';

it('backs up durable stores and clears only derived data through the pin-aware adapter', async () => {
  const tag = `inventory-${Date.now()}`;
  const cart = createCartStore(`${tag}-cart`), results = createResultsStore(`${tag}-results`);
  const queue = createQueueStore(`${tag}-queue`), gurs = createGursStore(`${tag}-gurs`);
  const values = { count: async () => 1, clear: vi.fn(async () => {}) };
  const transactions = { count: async () => 1, clear: vi.fn(async () => {}) };
  try {
    await cart.add([{kind:'parcel',koId:999,koName:'TEST',number:'1',eid:'test',geometry:null}]);
    await queue.db.table('kv').put({ k: 'quota', v: 'keep' });
    await gurs.db.table('pins').put({koId:999,pinnedAt:Date.now()});
    const inv = storageInventory({cart,results,queue,gurs,values,transactions});
    const backup = readBackup((await exportBackup(inv.backupDbs, null)).zip);
    expect(Object.keys(backup.dbs).sort()).toEqual(['cart','gurs','queue','results']);
    await inv.clearDerived();
    expect(await cart.count()).toBe(1);
    expect(await gurs.db.table('pins').count()).toBe(1);
    expect(await queue.db.table('kv').count()).toBe(1);
    expect(values.clear).toHaveBeenCalledOnce();
    expect(transactions.clear).toHaveBeenCalledOnce();
    await cart.clear();
    await restoreBackup(backup, inv.backupDbs, null);
    expect(await cart.count()).toBe(1);
    expect(await gurs.db.table('pins').count()).toBe(1);
  } finally { await Promise.all([cart.db.delete(),results.db.delete(),queue.db.delete(),gurs.db.delete()]); }
});
