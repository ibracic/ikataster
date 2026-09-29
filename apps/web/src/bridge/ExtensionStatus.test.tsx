import { render, screen, fireEvent } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { I18nProvider } from "../i18n";
import { BridgeContext, createAppBridge } from "./instance";
import { ExtensionStatus } from "./ExtensionStatus";
import { startRelay } from "@ikataster/extension/src/relay-core";
import { handleBackgroundMessage } from "@ikataster/extension/src/background-core";

beforeAll(() => {
  window.matchMedia ||= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as never;
  globalThis.ResizeObserver ||= class { observe() {} unobserve() {} disconnect() {} } as never;
});

/** jsdom's postMessage has no origin/source; emulate the browser so the strict checks run for real. */
function browserLikePostMessage() {
  return vi.spyOn(window, "postMessage").mockImplementation(((data: unknown) => {
    setTimeout(() => window.dispatchEvent(new MessageEvent("message", { data, origin: window.location.origin, source: window })), 0);
  }) as typeof window.postMessage);
}

const renderStatus = (mode: "mock" | "extension", platform: "desktop" | "ios-safari" = "desktop") =>
  render(
    <MantineProvider><I18nProvider>
      <BridgeContext.Provider value={{ mode, client: createAppBridge(mode) }}><ExtensionStatus platform={platform} /></BridgeContext.Provider>
    </I18nProvider></MantineProvider>,
  );

describe("ExtensionStatus", () => {
  it("mock transport: shows the extension as connected in test mode with an open eZK tab", async () => {
    renderStatus("mock");
    expect(await screen.findByText("Razširitev iKataster je povezana")).toBeInTheDocument();
    expect(screen.getByText("testni način")).toBeInTheDocument();
    expect(screen.getByText("Zavihek e-ZK je odprt.")).toBeInTheDocument();
  });

  it("no extension: shows install instructions with download links", async () => {
    const spy = browserLikePostMessage();
    renderStatus("extension");
    expect(await screen.findByText("Razširitev ni nameščena", {}, { timeout: 4000 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Navodila za namestitev" }));
    expect(await screen.findByRole("link", { name: /ikataster-chrome\.zip/ })).toHaveAttribute("href", "/extension/ikataster-chrome.zip");
    spy.mockRestore();
  });

  it("on a phone: explains that extract downloads need the desktop extension", async () => {
    const spy = browserLikePostMessage();
    renderStatus("extension", "ios-safari");
    expect(await screen.findByTestId("ext-mobile", {}, { timeout: 4000 })).toHaveTextContent(/deluje na računalniku.*ročno/);
    expect(screen.queryByRole("button", { name: "Navodila za namestitev" })).toBeNull();
    spy.mockRestore();
  });

  it("real relay + background logic over postMessage: detects the extension and reports no eZK tab", async () => {
    const spy = browserLikePostMessage();
    const stop = startRelay(window, {
      sendMessage: (m) => handleBackgroundMessage(m, { id: "self", origin: window.location.origin }, { runtimeId: "self", version: "0.1.0", queryTabs: async () => [] }),
    }, "0.1.0");
    renderStatus("extension");
    expect(await screen.findByText("Razširitev iKataster je povezana")).toBeInTheDocument();
    expect(screen.getByText("v0.1.0")).toBeInTheDocument();
    expect(await screen.findByText("Zavihek e-ZK ni odprt.")).toBeInTheDocument();
    expect(screen.queryByText("testni način")).not.toBeInTheDocument();
    stop(); spy.mockRestore();
  });
});
