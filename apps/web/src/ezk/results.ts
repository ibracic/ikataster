import { DATABASES } from "../data/inventory";
import { propertyKey } from "../property/identity";
import { ensurePersisted } from "../data/storage";
import Dexie, { type Table } from "dexie";
import type { EzkExtract, Owner } from "./types";
import { diffExtracts, type ExtractChanges } from "./diff";

export interface ResultRecord {
  /** Same key scheme as the cart: parcel:ko:number, building:ko:number, part:ko:number:part */
  key: string;
  fileName: string;
  addedAt: number;
  extract: EzkExtract;
  /** The original PDF is stored (table `pdfs`, same key); false/missing for results stored before #15. */
  hasPdf?: boolean;
  /** Set when this property was downloaded again: differences to the previous extract (`seen` once the user looked). */
  changes?: ExtractChanges & { seen?: boolean };
}

interface PdfRecord { key: string; bytes: Uint8Array }

/** A named snapshot of results (+ their PDFs). */
export interface Folder { id: string; name: string; createdAt: number; updatedAt: number; count: number }
interface FolderItem { folderId: string; key: string; record: ResultRecord }
interface FolderPdf { folderId: string; key: string; bytes: Uint8Array }
/** A named selection of downloaded extracts (references by key; the extracts themselves stay in `results`). */
export interface SavedList { id: string; name: string; keys: string[]; createdAt: number; updatedAt: number }

export function resultKey(x: EzkExtract): string {
  const p = x.property;
  if (p.type === "part" || p.type === "parcel" || p.type === "building") return propertyKey({ kind: p.type, koId: p.koId, number: p.number, part: p.part });
  return `other:${p.ezkId ?? p.label}`;
}

class ResultsDb extends Dexie {
  results!: Table<ResultRecord, string>;
  pdfs!: Table<PdfRecord, string>;
  folders!: Table<Folder, string>;
  folderItems!: Table<FolderItem, [string, string]>;
  folderPdfs!: Table<FolderPdf, [string, string]>;
  lists!: Table<SavedList, string>;
  constructor(name: string) {
    super(name);
    // v1: parsed eZK extracts, one per property (newest wins)
    this.version(1).stores({ results: "key, addedAt" });
    // v2: original PDFs in their own table, so live queries over results stay light
    this.version(2).stores({ results: "key, addedAt", pdfs: "key" });
    // v3: saved folders = copies of results + PDFs
    this.version(3).stores({
      results: "key, addedAt", pdfs: "key",
      folders: "id, updatedAt", folderItems: "[folderId+key], folderId", folderPdfs: "[folderId+key], folderId",
    });
    // v4: folders (full copies) become saved lists (key references). Copies of extracts that are no longer
    // in `results` are moved back there first, so nothing is lost; the copies are then dropped.
    this.version(4).stores({
      results: "key, addedAt", pdfs: "key",
      folders: "id, updatedAt", folderItems: "[folderId+key], folderId", folderPdfs: "[folderId+key], folderId",
      lists: "id, updatedAt",
    }).upgrade((tx) => foldersToLists((n) => tx.table(n)));
    // Old backups restored into this version still carry folders: convert them on open as well.
    this.on("ready", async () => {
      if (await this.folders.count()) await this.transaction("rw", [this.results, this.pdfs, this.folders, this.folderItems, this.folderPdfs, this.lists], () => foldersToLists((n) => this.table(n)));
    });
  }
}

async function foldersToLists(table: (name: string) => Table) {
  const folders = (await table("folders").toArray()) as Folder[];
  for (const f of folders) {
    const items = (await table("folderItems").where("folderId").equals(f.id).toArray()) as FolderItem[];
    for (const i of items) {
      if (await table("results").get(i.key)) continue;
      await table("results").put(i.record);
      const pdf = (await table("folderPdfs").get([f.id, i.key])) as FolderPdf | undefined;
      if (pdf) await table("pdfs").put({ key: i.key, bytes: pdf.bytes });
    }
    await table("lists").put({ id: f.id, name: f.name, keys: items.map((i) => i.key), createdAt: f.createdAt, updatedAt: f.updatedAt });
  }
  await table("folderItems").clear(); await table("folderPdfs").clear(); await table("folders").clear();
}


export function createResultsStore(name: string = DATABASES.results.name) {
  const db = new ResultsDb(name);
  let clock = 0;
  const now = () => (clock = Math.max(clock + 1, Date.now()));
  return {
    db,
    put: (extract: EzkExtract, fileName: string, pdf?: Uint8Array) => {
      const key = resultKey(extract);
      void ensurePersisted(); // first save asks the browser not to evict our data
      return db.transaction("rw", db.results, db.pdfs, async () => {
        const prev = await db.results.get(key);
        if (pdf) await db.pdfs.put({ key, bytes: pdf });
        else await db.pdfs.delete(key);
        const changes = prev ? { checkedAt: now(), previousCreatedAt: prev.extract.createdAt, items: diffExtracts(prev.extract, extract) } : undefined;
        await db.results.put({ key, fileName, addedAt: prev?.addedAt ?? now(), extract, hasPdf: !!pdf, ...(changes ? { changes } : {}) });
      });
    },
    list: () => db.results.orderBy("addedAt").toArray(),
    /** Mark change reports as seen (badge goes away, details stay). */
    acknowledge: (keys: string[]) => db.transaction("rw", db.results, async () => {
      for (const k of keys) await db.results.where("key").equals(k).modify((r) => { if (r.changes) r.changes.seen = true; });
    }),
    /** Original PDFs by result key (read outside live queries). */
    pdfs: async (keys: string[]) => {
      const rows = await db.pdfs.bulkGet(keys);
      return new Map(rows.filter((r): r is PdfRecord => !!r).map((r) => [r.key, r.bytes]));
    },
    remove: (keys: string[]) => db.transaction("rw", db.results, db.pdfs, async () => {
      await db.results.bulkDelete(keys);
      await db.pdfs.bulkDelete(keys);
    }),
    clear: () => db.transaction("rw", db.results, db.pdfs, async () => { await db.results.clear(); await db.pdfs.clear(); }),

    savedLists: () => db.lists.orderBy("updatedAt").reverse().toArray(),
    /** New saved list with the given extracts. Returns its id. */
    createList: async (name: string, keys: string[]) => {
      const clean = name.trim().slice(0, 120);
      if (!clean) throw new Error("List name required");
      const id = globalThis.crypto?.randomUUID?.() ?? `l${Date.now()}${Math.random().toString(36).slice(2)}`;
      const t = now();
      await db.lists.put({ id, name: clean, keys: [...new Set(keys)], createdAt: t, updatedAt: t });
      return id;
    },
    addToList: (id: string, keys: string[]) => db.transaction("rw", db.lists, async () => {
      const l = await db.lists.get(id);
      if (!l) throw new Error("List not found");
      const next = [...new Set([...l.keys, ...keys])];
      await db.lists.update(id, { keys: next, updatedAt: now() });
      return next.length - l.keys.length;
    }),
    removeFromList: (id: string, keys: string[]) => db.transaction("rw", db.lists, async () => {
      const l = await db.lists.get(id);
      if (!l) throw new Error("List not found");
      const drop = new Set(keys);
      await db.lists.update(id, { keys: l.keys.filter((k) => !drop.has(k)), updatedAt: now() });
    }),
    renameList: async (id: string, name: string) => {
      const clean = name.trim().slice(0, 120);
      if (!clean) throw new Error("List name required");
      if (!(await db.lists.update(id, { name: clean }))) throw new Error("List not found");
    },
    /** Deletes only the list; the extracts stay. */
    deleteList: (id: string) => db.lists.delete(id),
  };
}
export type ResultsStore = ReturnType<typeof createResultsStore>;

const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

function ownerText(o: Owner): string {
  const h = o.holder;
  return norm([h.name, "address" in h ? h.address : "", "companyId" in h ? h.companyId : "", "birthDate" in h ? h.birthDate : ""].join(" "));
}

export interface ResultGroup { record: ResultRecord; owners: Owner[] }

/** Owners grouped by property; `filter` narrows owners, groups without matches are hidden. */
export function groupResults(records: ResultRecord[], filter: string): ResultGroup[] {
  const words = norm(filter).split(/\s+/).filter(Boolean);
  return records
    .map((record) => ({ record, owners: record.extract.owners.filter((o) => words.every((w) => ownerText(o).includes(w))) }))
    .filter((g) => !words.length || g.owners.length);
}

/** Export/list scope beyond the owner text filter: cadastral municipality, building or parcel number, download day. */
export interface RecordScope { ko?: number | null; number?: string; day?: string | null }

/** Local (Ljubljana) calendar day of a timestamp, YYYY-MM-DD. */
export const localDay = (ms: number) => new Date(ms).toLocaleDateString("sv-SE", { timeZone: "Europe/Ljubljana" });

export function filterRecords<T extends Pick<ResultRecord, "key" | "addedAt">>(records: T[], s: RecordScope): T[] {
  const num = (s.number ?? "").trim().replace(/\s+/g, "");
  return records.filter((r) => {
    const [kind, ko, number, part] = r.key.split(":");
    if (s.ko != null && Number(ko) !== s.ko) return false;
    if (s.day && localDay(r.addedAt) !== s.day) return false;
    if (num) {
      const full = kind === "part" ? `${number}/${part}` : number;
      if (full !== num && !(kind !== "parcel" && number === num)) return false;
    }
    return true;
  });
}

/** Download days (newest first) with record counts, for the day picker. */
export function resultDays(records: Pick<ResultRecord, "addedAt">[]): [string, number][] {
  const m = new Map<string, number>();
  for (const r of records) { const d = localDay(r.addedAt); m.set(d, (m.get(d) ?? 0) + 1); }
  return [...m].sort((a, b) => b[0].localeCompare(a[0]));
}
