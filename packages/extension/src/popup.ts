import { ezkTabOpen, openEzk, type TabsApi } from "./popup-core";

const tabs: TabsApi = {
  query: (q) => chrome.tabs.query(q),
  update: (id) => chrome.tabs.update(id, { active: true }),
  create: (o) => chrome.tabs.create(o),
  focusWindow: (id) => chrome.windows.update(id, { focused: true }),
};

const status = document.getElementById("status")!;
const btn = document.getElementById("open") as HTMLButtonElement;
document.getElementById("version")!.textContent = `v${chrome.runtime.getManifest().version}`;

async function refresh() {
  const open = await ezkTabOpen(tabs);
  status.textContent = open ? "Zavihek e-ZK je odprt." : "Zavihek e-ZK ni odprt.";
  status.className = open ? "ok" : "warn";
  btn.textContent = open ? "Pokaži zavihek e-ZK" : "Odpri e-ZK (esodisce.si)";
}

btn.addEventListener("click", async () => { await openEzk(tabs); window.close(); });
void refresh();
