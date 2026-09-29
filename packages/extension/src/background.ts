import { handleBackgroundMessage, reloadAppTabs } from "./background-core";
import { ezkPostInPage } from "./ezk-form";

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleBackgroundMessage(msg, sender, {
    runtimeId: chrome.runtime.id,
    version: chrome.runtime.getManifest().version,
    queryTabs: (q) => chrome.tabs.query(q),
    postInTab: async (tabId, url, body) => {
      const [r] = await chrome.scripting.executeScript({ target: { tabId }, func: ezkPostInPage, args: [url, body] });
      if (!r?.result) throw new Error("e-ZK tab did not answer (reload the e-ZK tab)");
      return r.result as { status: number; contentType: string; base64: string };
    },
  }).then(sendResponse);
  return true; // async response
});

chrome.runtime.onInstalled.addListener(() => {
  const matches = (chrome.runtime.getManifest().content_scripts ?? []).flatMap((c) => c.matches ?? []);
  void reloadAppTabs(matches, { query: (q) => chrome.tabs.query(q), reload: (id) => chrome.tabs.reload(id) });
});
