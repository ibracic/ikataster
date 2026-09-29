import { createGursStore } from "./db";

/** The one local GURS database of the app (answer cache + pinned KOs). */
export const gursStore = createGursStore();
