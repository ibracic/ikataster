// Minimal typing for the WebExtension APIs we use (chrome.* is promise-based in MV3 on Chrome and Firefox).
declare const chrome: {
  runtime: {
    id: string;
    getManifest(): { version: string; content_scripts?: { matches?: string[] }[] };
    sendMessage(msg: unknown): Promise<unknown>;
    onInstalled: { addListener(fn: () => void): void };
    onMessage: { addListener(fn: (msg: unknown, sender: { id?: string; origin?: string; url?: string }, sendResponse: (r: unknown) => void) => boolean | void): void };
  };
  tabs: {
    query(q: { url: string | string[] }): Promise<{ id?: number; windowId?: number }[]>;
    update(id: number, p: { active: boolean }): Promise<unknown>;
    create(p: { url: string }): Promise<unknown>;
    reload(id: number): Promise<void>;
  };
  windows: { update(id: number, p: { focused: boolean }): Promise<unknown> };
};
