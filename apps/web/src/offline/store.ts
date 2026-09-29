import { createGursStore, type GursStore } from "../local/db";

export { bboxOf, type Pin } from "../local/db";
/** Pinned KOs live in the shared relational GURS store (same tables as the answer cache). */
export const createOfflineStore = (name?: string) => createGursStore(name);
export type OfflineStore = GursStore;
