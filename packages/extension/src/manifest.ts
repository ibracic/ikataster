export type Target = "chrome" | "firefox";

/** MV3 manifest per browser. Chrome/Edge: background service worker. Firefox: background scripts + gecko id. */
export function manifest(target: Target, version: string, origins: readonly string[]): Record<string, unknown> {
  const icons = { 16: "icons/icon16.png", 48: "icons/icon48.png", 128: "icons/icon128.png" };
  return {
    manifest_version: 3,
    name: "iKataster — izpisi iz zemljiške knjige",
    short_name: "iKataster",
    version,
    description: "Poveže spletno aplikacijo iKataster z e-ZK (esodisce.si) in tvojo SI-PASS prijavo. Podatki ne zapustijo brskalnika.",
    icons,
    permissions: ["tabs"],
    host_permissions: ["https://esodisce.si/*"],
    action: { default_title: "iKataster", default_popup: "popup.html", default_icon: icons },
    content_scripts: [
      {
        matches: [...origins.map((o) => `${o}/*`), "http://localhost/*", "http://127.0.0.1/*"],
        js: ["relay.js"],
        run_at: "document_start",
      },
    ],
    background: target === "chrome"
      ? { service_worker: "background.js", type: "module" }
      : { scripts: ["background.js"], type: "module" },
    ...(target === "firefox"
      ? { browser_specific_settings: {
          // data_collection_permissions (required by AMO) needs Firefox 140 desktop / 142 Android
          gecko: { id: "ikataster@ikataster", strict_min_version: "140.0", data_collection_permissions: { required: ["none"] } },
          gecko_android: { strict_min_version: "142.0" },
        } }
      : {}),
  };
}
