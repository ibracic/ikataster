import { createGursStore, type GursStore } from "../local/db";

/** The answer cache lives in the shared relational GURS store (managers, buildings, parts, fetches). */
export const createCacheStore = (name?: string) => createGursStore(name);
export type CacheStore = GursStore;
