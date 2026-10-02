import { DATABASES } from "../data/inventory";
import { propertyKey } from "../property/identity";
import { ensurePersisted } from "../data/storage";
import Dexie, { type Table } from "dexie";
import type { EzkExtract, Owner } from "./types";

export interface ResultRecord {
  /** Same key scheme as the cart: parcel:ko:number, building:ko:number, part:ko:number:part */
  key: string;
  fileName: string;
  addedAt: number;
  extract: EzkExtract;
  /** The original PDF is stored (table `pdfs`, same key); false/missing for results stored before #15. */
  hasPdf?: boolean;
}

interface PdfRecord { key: string; bytes: Uint8Array }

/** A named snapshot of results (+ their PDFs). */
export interface Folder { id: string; name: string; createdAt: number; updatedAt: number; count: number }
interface FolderItem { folderId: string; key: string; record: ResultRecord }
interface FolderPdf { folderId: string; key: string; bytes: Uint8Array }

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
  }
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
        if (pdf) await db.pdfs.put({ key, bytes: pdf });
        else await db.pdfs.delete(key);
        await db.results.put({ key, fileName, addedAt: now(), extract, hasPdf: !!pdf });
      });
    },
    list: () => db.results.orderBy("addedAt").toArray(),
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

    listFolders: () => db.folders.orderBy("updatedAt").reverse().toArray(),
    /** Save the current results as a new folder, or overwrite folder `id`. Returns the folder id. */
    saveFolder: (name: string, id?: string) => db.transaction("rw", [db.results, db.pdfs, db.folders, db.folderItems, db.folderPdfs], async () => {
      const clean = name.trim().slice(0, 120);
      if (!clean) throw new Error("Folder name required");
      const folderId = id ?? (globalThis.crypto?.randomUUID?.() ?? `f${Date.now()}${Math.random().toString(36).slice(2)}`);
      const prev = id ? await db.folders.get(id) : undefined;
      if (id && !prev) throw new Error("Folder not found");
      const records = await db.results.toArray();
      const pdfs = await db.pdfs.toArray();
      await db.folderItems.where("folderId").equals(folderId).delete();
      await db.folderPdfs.where("folderId").equals(folderId).delete();
      await db.folderItems.bulkPut(records.map((record) => ({ folderId, key: record.key, record })));
      await db.folderPdfs.bulkPut(pdfs.map((p) => ({ folderId, key: p.key, bytes: p.bytes })));
      const t = now();
      await db.folders.put({ id: folderId, name: clean, createdAt: prev?.createdAt ?? t, updatedAt: t, count: records.length });
      return folderId;
    }),
    renameFolder: async (id: string, name: string) => {
      const clean = name.trim().slice(0, 120);
      if (!clean) throw new Error("Folder name required");
      if (!(await db.folders.update(id, { name: clean }))) throw new Error("Folder not found");
    },
    deleteFolder: (id: string) => db.transaction("rw", db.folders, db.folderItems, db.folderPdfs, async () => {
      await db.folders.delete(id);
      await db.folderItems.where("folderId").equals(id).delete();
      await db.folderPdfs.where("folderId").equals(id).delete();
    }),
    /** Replace the current results with the folder's contents (exact copy, PDFs included). */
    openFolder: (id: string) => db.transaction("rw", [db.results, db.pdfs, db.folders, db.folderItems, db.folderPdfs], async () => {
      if (!(await db.folders.get(id))) throw new Error("Folder not found");
      const items = await db.folderItems.where("folderId").equals(id).toArray();
      const pdfs = await db.folderPdfs.where("folderId").equals(id).toArray();
      await db.results.clear(); await db.pdfs.clear();
      await db.results.bulkPut(items.map((i) => i.record));
      await db.pdfs.bulkPut(pdfs.map((p) => ({ key: p.key, bytes: p.bytes })));
      return items.length;
    }),
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
