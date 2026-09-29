import { startRelay } from "./relay-core";

startRelay(window, { sendMessage: (m) => chrome.runtime.sendMessage(m) }, chrome.runtime.getManifest().version);
