import { backupSetting } from "./inventory";
import type Dexie from "dexie";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

/**
 * Full local backup: every table of the app's IndexedDB databases plus the user's localStorage
 * settings, as one ZIP (data.json inside, PDFs as base64). Restore replaces everything.
 */
export const BACKUP_FORMAT = "ikataster-backup";
export const BACKUP_VERSION = 1;
/** localStorage keys worth keeping; caches (KO list) are rebuilt automatically. */


export interface BackupDbs { [name: string]: Dexie }
export interface BackupData {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  dbs: Record<string, Record<string, unknown[]>>;
  local: Record<string, string>;
}
export interface BackupSummary { tables: Record<string, number>; local: number; createdAt: string }

const b64 = (u: Uint8Array) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
/** IndexedDB may hand back typed arrays from another realm, so no instanceof. */
const isU8 = (v: unknown): v is Uint8Array => Object.prototype.toString.call(v) === "[object Uint8Array]";
const replacer = (_k: string, v: unknown) => (isU8(v) ? { $u8: b64(v) } : v);
const reviver = (_k: string, v: unknown) => (v && typeof v === "object" && typeof (v as { $u8?: unknown }).$u8 === "string" && Object.keys(v).length === 1 ? unb64((v as { $u8: string }).$u8) : v);

export async function collectBackup(dbs: BackupDbs, storage: Storage | null = globalThis.localStorage ?? null, now = new Date()): Promise<BackupData> {
  const out: BackupData["dbs"] = {};
  for (const [name, db] of Object.entries(dbs)) {
    if (!db.isOpen()) await db.open();
    out[name] = {};
    await db.transaction("r", db.tables, async () => {
      for (const t of db.tables) out[name][t.name] = await t.toArray();
    });
  }
  const local: Record<string, string> = {};
  if (storage) for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i)!;
    if (backupSetting(k)) local[k] = storage.getItem(k) ?? "";
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: now.toISOString(), dbs: out, local };
}

export async function exportBackup(dbs: BackupDbs, storage?: Storage | null, now?: Date): Promise<{ zip: Uint8Array; fileName: string; summary: BackupSummary }> {
  const data = await collectBackup(dbs, storage, now);
  const zip = zipSync({ "data.json": strToU8(JSON.stringify(data, replacer)) }, { level: 6 });
  return { zip, fileName: `ikataster-varnostna-kopija-${data.createdAt.slice(0, 10)}.zip`, summary: summarize(data) };
}

export function summarize(d: BackupData): BackupSummary {
  const tables: Record<string, number> = {};
  for (const [db, ts] of Object.entries(d.dbs)) for (const [t, rows] of Object.entries(ts)) tables[`${db}.${t}`] = rows.length;
  return { tables, local: Object.keys(d.local).length, createdAt: d.createdAt };
}

export class BackupError extends Error { constructor(public reason: "not-a-backup" | "newer-version" | "corrupt") { super(reason); } }

/** Parse and validate a backup file (ZIP with data.json, or the bare JSON). */
export function readBackup(bytes: Uint8Array): BackupData {
  let json: string;
  try {
    json = bytes[0] === 0x50 && bytes[1] === 0x4b ? strFromU8(unzipSync(bytes, { filter: (f) => f.name === "data.json" })["data.json"] ?? new Uint8Array()) : strFromU8(bytes);
  } catch { throw new BackupError("corrupt"); }
  let d: BackupData;
  try { d = JSON.parse(json, reviver); } catch { throw new BackupError(json ? "corrupt" : "not-a-backup"); }
  if (!d || d.format !== BACKUP_FORMAT || typeof d.dbs !== "object") throw new BackupError("not-a-backup");
  if (d.version > BACKUP_VERSION) throw new BackupError("newer-version");
  return d;
}

/** Replace all local data with the backup. Unknown databases/tables are ignored. */
export async function restoreBackup(d: BackupData, dbs: BackupDbs, storage: Storage | null = globalThis.localStorage ?? null): Promise<BackupSummary> {
  for (const [name, db] of Object.entries(dbs)) {
    // v1 backups called the GURS store "offline" (pins only); its part rows lack the relational fields
    const src = d.dbs[name] ?? (name === "gurs" ? d.dbs.offline : undefined) ?? {};
    if (name === "gurs" && Array.isArray(src.parts)) src.parts = (src.parts as { eid?: string; part?: { eid: string; use: string | null; manager?: { id: number } | null } }[])
      .map((r) => (r.eid || !r.part ? r : { ...r, eid: r.part.eid, use: r.part.use, managerId: r.part.manager?.id ?? null }));
    if (!db.isOpen()) await db.open();
    await db.transaction("rw", db.tables, async () => {
      for (const t of db.tables) {
        await t.clear();
        const rows = src[t.name];
        if (Array.isArray(rows) && rows.length) await t.bulkPut(rows as never[]);
      }
    });
  }
  if (storage) {
    for (let i = storage.length - 1; i >= 0; i--) { const k = storage.key(i)!; if (backupSetting(k)) storage.removeItem(k); }
    for (const [k, v] of Object.entries(d.local ?? {})) if (backupSetting(k)) storage.setItem(k, v);
  }
  return summarize(d);
}
