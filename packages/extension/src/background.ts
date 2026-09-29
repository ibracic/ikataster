import { handleBackgroundMessage, reloadAppTabs } from "./background-core";

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleBackgroundMessage(msg, sender, {
    runtimeId: chrome.runtime.id,
    version: chrome.runtime.getManifest().version,
    queryTabs: (q) => chrome.tabs.query(q),
  }).then(sendResponse);
  return true; // async response
});

chrome.runtime.onInstalled.addListener(() => {
  const matches = (chrome.runtime.getManifest().content_scripts ?? []).flatMap((c) => c.matches ?? []);
  void reloadAppTabs(matches, { query: (q) => chrome.tabs.query(q), reload: (id) => chrome.tabs.reload(id) });
});
