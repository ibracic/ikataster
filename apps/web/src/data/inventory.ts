import type Dexie from 'dexie';

/** Names and lifecycle policy, not schemas. Mixed GURS storage must clear through its pin-aware adapter. */
export const DATABASES = {
  cart: { name: 'ikataster', category: 'user', backup: true, legacy: 'parcela' },
  results: { name: 'ikataster-results', category: 'user', backup: true, legacy: 'parcela-results' },
  queue: { name: 'ikataster-queue', category: 'user', backup: true, legacy: 'parcela-queue' },
  gurs: { name: 'ikataster-gurs', category: 'mixed', backup: true },
  values: { name: 'ikataster-values', category: 'cache', backup: false },
  transactions: { name: 'ikataster-tx', category: 'cache', backup: false },
} as const;
export const LEGACY_DATABASES = { offline: 'ikataster-offline', cache: 'ikataster-cache' };
export const DATABASE_RENAMES: [string, string][] = [
  ...Object.values(DATABASES).flatMap(d => 'legacy' in d ? [[d.legacy, d.name] as [string, string]] : []),
  ['parcela-offline', LEGACY_DATABASES.offline],
];
export const SETTINGS = {
  language: 'ikataster.lang', basemap: 'ikataster.basemap', ezkLayer: 'ikataster.ezkLayer',
  panelWide: 'ikataster.panelWide', lastManager: 'ikataster.manager.last', bridge: 'ikataster.bridge',
  lastBackup: 'ikataster.lastBackup', persistAsked: 'ikataster.persistAsked',
  installHint: 'ikataster.installHint.dismissed', pinMaxAge: 'ikataster.pinMaxAgeDays',
  legacyQuota: 'ikataster.ezk.quota.v1', kos: 'ikataster.kos.v1', theme: 'mantine-color-scheme',
} as const;
export const isLocalCache = (key: string) => key.startsWith('ikataster.kos.');
// Preserve unrecognised app settings from older/newer backups; never treat them as disposable.
export const backupSetting = (key: string) => (key.startsWith('ikataster.') && !isLocalCache(key)) || key.startsWith(SETTINGS.theme);
export const isAppCache = (key: string) => key.startsWith('ikataster-') || key.startsWith('parcela-');
export interface StorageAdapter { db?: Dexie; count?: () => Promise<number>; clear?: () => Promise<unknown> }
export type StorageAdapters = Record<keyof typeof DATABASES, StorageAdapter>;

/** Complete adapters are required at composition time: adding a store cannot silently omit its policy. */
export function storageInventory(adapters: StorageAdapters) {
  return {
    backupDbs: Object.fromEntries(Object.entries(DATABASES).filter(([, d]) => d.backup).map(([id]) => {
      const db = adapters[id as keyof StorageAdapters].db;
      if (!db) throw new Error(`Missing backup adapter: ${id}`);
      return [id, db];
    })),
    async clearDerived() {
      let count = 0;
      for (const [id, policy] of Object.entries(DATABASES)) {
        if (policy.category === 'user') continue;
        const adapter = adapters[id as keyof StorageAdapters];
        if (!adapter.clear) throw new Error(`Missing cache adapter: ${id}`);
        count += await adapter.count?.() ?? 0;
        await adapter.clear();
      }
      return count;
    },
  };
}
